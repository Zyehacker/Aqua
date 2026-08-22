use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use tauri::AppHandle;
use zip::write::{SimpleFileOptions, ZipWriter};
use zip::ZipArchive;

use crate::mods::{read_metadata, write_metadata, InstanceMetadata};
use crate::settings::{default_mc_dir, instance_dir};

const FORMAT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PackageManifest {
    pub format: String,
    pub format_version: u32,
    pub created_at: u64,
    pub instance: InstanceMetadata,
    pub files: Vec<PackageFile>,
    pub java_required_major: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PackageFile {
    pub path: String,
    pub size: u64,
    pub sha1: String,
}

fn root(mc_dir: Option<String>) -> Result<PathBuf, String> {
    mc_dir
        .map(PathBuf::from)
        .or_else(default_mc_dir)
        .ok_or_else(|| "Could not determine Aqua directory".into())
}

fn hash_file(path: &Path) -> Result<(u64, String), String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha1::new();
    let mut buf = [0u8; 32 * 1024];
    let mut size = 0;
    loop {
        let count = file.read(&mut buf).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        size += count as u64;
        hasher.update(&buf[..count]);
    }
    Ok((size, format!("{:x}", hasher.finalize())))
}

fn collect_files(
    dir: &Path,
    base: &Path,
    out: &mut Vec<(PathBuf, PackageFile)>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, base, out)?;
        } else if path.is_file() {
            let (size, sha1) = hash_file(&path)?;
            let relative = path
                .strip_prefix(base)
                .map_err(|e| e.to_string())?
                .to_path_buf();
            out.push((
                path,
                PackageFile {
                    path: relative.to_string_lossy().replace('\\', "/"),
                    size,
                    sha1,
                },
            ));
        }
    }
    Ok(())
}

fn add_file(writer: &mut ZipWriter<File>, source: &Path, archive_path: &str) -> Result<(), String> {
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    writer
        .start_file(archive_path, options)
        .map_err(|e| e.to_string())?;
    let mut file = File::open(source).map_err(|e| e.to_string())?;
    std::io::copy(&mut file, writer).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_instance(
    instance_id: String,
    destination: String,
    mc_dir: Option<String>,
) -> Result<String, String> {
    let root = root(mc_dir)?;
    let metadata = read_metadata(&root, &instance_id)
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
    let instance_root = instance_dir(&root, &instance_id);
    let package = PathBuf::from(destination);
    if let Some(parent) = package.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut files = Vec::new();
    if instance_root.exists() {
        let before = files.len();
        collect_files(&instance_root, &instance_root, &mut files)?;
        for (_, entry) in files.iter_mut().skip(before) {
            entry.path = format!("instance/{}", entry.path);
        }
    }
    let java_required_major = Some(crate::java::get_required_java_major(&metadata.mc_version));
    let manifest = PackageManifest {
        format: "aqua-instance".into(),
        format_version: FORMAT_VERSION,
        created_at: crate::settings::app_timestamp(),
        instance: metadata,
        files: files.iter().map(|(_, file)| file.clone()).collect(),
        java_required_major,
    };
    let file = File::create(&package).map_err(|e| e.to_string())?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    writer
        .start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    writer
        .write_all(
            serde_json::to_string_pretty(&manifest)
                .map_err(|e| e.to_string())?
                .as_bytes(),
        )
        .map_err(|e| e.to_string())?;
    for (source, entry) in files {
        if entry.path.eq_ignore_ascii_case("account.json")
            || entry.path.to_ascii_lowercase().contains("credentials")
            || entry.path.to_ascii_lowercase().contains("token")
        {
            return Err("Refusing to export authentication or credential data".to_string());
        }
        let archive_path = format!("files/{}", entry.path);
        add_file(&mut writer, &source, &archive_path)?;
    }
    writer.finish().map_err(|e| e.to_string())?;
    Ok(package.to_string_lossy().to_string())
}

fn safe_relative(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if candidate.is_absolute()
        || candidate.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("Unsafe package path: {path}"));
    }
    Ok(candidate.to_path_buf())
}

fn unpack_and_validate(package_path: &str, temp: &Path) -> Result<PackageManifest, String> {
    let file = File::open(package_path).map_err(|e| e.to_string())?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Invalid .aquainst archive: {e}"))?;
    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|_| "Package is missing manifest.json".to_string())?;
    let mut raw = String::new();
    manifest_file
        .read_to_string(&mut raw)
        .map_err(|e| e.to_string())?;
    drop(manifest_file);
    let manifest: PackageManifest =
        serde_json::from_str(&raw).map_err(|e| format!("Invalid package manifest: {e}"))?;
    if manifest.format != "aqua-instance" || manifest.format_version > FORMAT_VERSION {
        return Err("Unsupported Aqua instance package version".into());
    }
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let Some(path) = entry.name().strip_prefix("files/") else {
            continue;
        };
        let relative = safe_relative(path)?;
        let output = temp.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&output).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    for expected in &manifest.files {
        if expected.path.eq_ignore_ascii_case("account.json")
            || expected.path.to_ascii_lowercase().contains("credentials")
            || expected.path.to_ascii_lowercase().contains("token")
        {
            return Err("Package contains forbidden authentication data".to_string());
        }
        let extracted = temp.join(safe_relative(&expected.path)?);
        if !extracted.exists() {
            return Err(format!(
                "Package is missing declared file: {}",
                expected.path
            ));
        }
        let (size, sha1) = hash_file(&extracted)?;
        if size != expected.size || sha1 != expected.sha1 {
            return Err(format!("Integrity check failed for {}", expected.path));
        }
    }
    Ok(manifest)
}

#[tauri::command]
pub async fn import_instance(
    app: AppHandle,
    package_path: String,
    mc_dir: Option<String>,
    requested_name: Option<String>,
) -> Result<String, String> {
    let root = root(mc_dir)?;
    let manifest_preview = {
        let file = File::open(&package_path).map_err(|e| e.to_string())?;
        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("Invalid .aquainst archive: {e}"))?;
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|_| "Package is missing manifest.json".to_string())?;
        let mut raw = String::new();
        manifest_file
            .read_to_string(&mut raw)
            .map_err(|e| e.to_string())?;
        serde_json::from_str::<PackageManifest>(&raw)
            .map_err(|e| format!("Invalid package manifest: {e}"))?
    };
    if manifest_preview.format != "aqua-instance"
        || manifest_preview.format_version > FORMAT_VERSION
    {
        return Err("Unsupported Aqua instance package version".into());
    }
    let name = requested_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| manifest_preview.instance.name.clone());
    let id = crate::mods::new_instance_id(&root);
    if read_metadata(&root, &id).is_some() || instance_dir(&root, &id).exists() {
        return Err(format!("An instance named '{name}' already exists"));
    }
    let temp = root
        .join(".aquainst-import")
        .join(format!("{}-{}", id, std::process::id()));
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let manifest = unpack_and_validate(&package_path, &temp)?;
    let result: Result<(), String> = {
        let target = instance_dir(&root, &id);
        fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        let source_instance = temp.join("instance");
        if source_instance.exists() {
            copy_dir(&source_instance, &target)?;
        }
        let loader = manifest.instance.loader.clone();
        if loader != "vanilla" && loader != "fabric" && loader != "forge" {
            return Err(format!("Unsupported instance loader: {loader}"));
        }
        let (installed_version_id, loader_version) = crate::install::install_version(
            app.clone(),
            loader.clone(),
            manifest.instance.mc_version.clone(),
            manifest.instance.loader_version.clone(),
            Some(root.to_string_lossy().to_string()),
        )
        .await?;
        let metadata = InstanceMetadata {
            id: id.clone(),
            name: name.clone(),
            game_dir: None,
            java_path: None,
            java_runtime: None,
            java_version: None,
            installed_version_id,
            loader_version,
            loader,
            ..manifest.instance.clone()
        };
        write_metadata(&root, &metadata)?;
        Ok::<(), String>(())
    };
    let _ = fs::remove_dir_all(&temp);
    result.map(|_| id)
}

pub(crate) fn copy_dir(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let destination = target.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &destination)?;
        } else {
            fs::copy(entry.path(), destination).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
