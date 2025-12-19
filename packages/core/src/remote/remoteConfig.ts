import { z } from "zod";

export const RemoteConfigSchema = z.object({
  /**
   * Active un “mode maintenance” à distance (bloque le lancement).
   */
  maintenance: z
    .object({
      enabled: z.boolean().default(false),
      message: z.string().optional()
    })
    .default({ enabled: false }),
  /**
   * Fil d’actualité. Le format est volontairement simple et extensible.
   */
  news: z
    .object({
      title: z.string().optional(),
      items: z
        .array(
          z.object({
            id: z.string().min(1),
            title: z.string().min(1),
            body: z.string().min(1),
            url: z.string().url().optional(),
            date: z.string().optional()
          })
        )
        .default([])
    })
    .default({ items: [] })
});

export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

export async function fetchRemoteConfig(url: string): Promise<RemoteConfig> {
  const res = await fetch(url, {
    headers: { accept: "application/json" }
  });
  if (!res.ok) throw new Error(`Remote config HTTP ${res.status}`);
  const json = await res.json();
  return RemoteConfigSchema.parse(json);
}

