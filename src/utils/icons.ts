export function iconPath(name: string): string {
  return `/icons/${name}`;
}

export function iconImg(name: string, alt = ""): string {
  return `<img class="icon-img" src="${iconPath(name)}" alt="${alt}" width="18" height="18" loading="lazy" />`;
}
