export const dashboardKeys = {
  all: ["dashboard"] as const,
  snapshot: (userId: string) => [...dashboardKeys.all, userId, "snapshot"] as const,
};
