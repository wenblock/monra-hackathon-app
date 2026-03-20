export const sessionKeys = {
  all: ["session"] as const,
  bootstrap: (userId: string) => [...sessionKeys.all, "bootstrap", userId] as const,
};
