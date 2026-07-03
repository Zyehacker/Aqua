import { createClient } from "@supabase/supabase-js";
import type { FeaturedServer, NewsItem } from "../types/api";

export const supabase = createClient(
  "https://sqjosdxcanoqflmyrman.supabase.co",
  "sb_publishable_5vjVwG8tv0VJ4G2Y8djU7Q_q6FmvIvb"
);

export async function fetchNews(): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from("news")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !data) return fallbackNews();
  return data as NewsItem[];
}

export async function fetchFeaturedServers(): Promise<FeaturedServer[]> {
  const { data, error } = await supabase
    .from("featured_servers")
    .select("*")
    .order("players", { ascending: false })
    .limit(8);

  if (error || !data) return [];
  return data as FeaturedServer[];
}

function fallbackNews(): NewsItem[] {
  return [
    {
      id: "welcome",
      title: "Welcome to Aqua",
      summary: "A refined launcher experience with Fabric support and Modrinth browsing.",
      category: "Announcement",
      date: new Date().toISOString(),
      image_url: "/launcher-bg.png",
    },
  ];
}
