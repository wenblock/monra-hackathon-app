import { RouterProvider } from "@tanstack/react-router";

import { router } from "@/router-instance";

function AppRouterProvider() {
  return <RouterProvider router={router} />;
}

export { AppRouterProvider };
