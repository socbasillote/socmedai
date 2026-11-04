import { useLocation, Navigate } from "react-router";
import { useAuth } from "@/auth/useAuth";

import AuthPage from "@/auth/AuthPage";
import { PostEditorRoute } from "@/components/PostEditorRoute";
import DashboardPage from "@/pages/DashboardPage";

export default function App() {
  const location = useLocation();
  const { user, loading } = useAuth();

  const isAuthRoute =
    location.pathname === "/login" || location.pathname === "/signup";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div
            className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"
            role="status"
            aria-label="Loading"
          />
          <p className="text-sm text-slate-600">Restoring your session...</p>
        </div>
      </main>
    );
  }

  if (!user && !isAuthRoute) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user && isAuthRoute) {
    return <Navigate to="/" replace />;
  }

  if (isAuthRoute) {
    return <AuthPage />;
  }

  const isNewPostRoute = location.pathname === "/posts/new";

  const editPostMatch = location.pathname.match(/^\/posts\/([^/]+)\/edit\/?$/);

  if (isNewPostRoute || editPostMatch) {
    return (
      <PostEditorRoute
        mode={isNewPostRoute ? "create" : "edit"}
        postId={editPostMatch?.[1]}
      />
    );
  }

  return <DashboardPage />;
}
