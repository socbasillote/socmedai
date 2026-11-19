import { useAuth } from "@/auth/useAuth";
import { Link } from "react-router";
export function UserSettingsView({ profile = false }: { profile?: boolean }) {
  const { user } = useAuth();
  const metadataName =
    user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  const name =
    typeof metadataName === "string"
      ? metadataName
      : (user?.email?.split("@")[0] ?? "My account");
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">
        Personal account
      </p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">
        {profile ? "Profile" : "User settings"}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Your personal account details apply across all your workspaces.
      </p>
      <dl className="mt-6 space-y-5">
        <div>
          <dt className="text-sm text-slate-500">Name</dt>
          <dd className="mt-1 font-normal text-slate-900">{name}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Email</dt>
          <dd className="mt-1 break-all font-normal text-slate-900">
            {user?.email}
          </dd>
        </div>
      </dl>
      <Link
        to={profile ? "/account/settings" : "/account/profile"}
        className="mt-6 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-normal text-violet-700 hover:bg-violet-50"
      >
        {profile ? "User settings" : "View profile"}
      </Link>
    </section>
  );
}
