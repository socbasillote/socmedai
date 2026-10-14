import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowRight, Sparkles } from "lucide-react";

import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/button";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const isSignUp = location.pathname === "/signup";
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "" },
  });

  async function handleSignIn(values: SignInValues) {
    setServerError("");
    setNotice("");

    try {
      const { error } = await signIn(values.email, values.password);

      if (error) {
        setServerError(error.message);
        return;
      }

      navigate("/", { replace: true });
    } catch {
      setServerError("Unable to sign in. Please try again.");
    }
  }

  async function handleSignUp(values: SignUpValues) {
    setServerError("");
    setNotice("");

    try {
      const { error } = await signUp(values.email, values.password);

      if (error) {
        setServerError(error.message);
        return;
      }

      setNotice(
        "Account request submitted. If email confirmation is enabled, check your inbox to verify your address before signing in.",
      );
    } catch {
      setServerError("Unable to create your account. Please try again.");
    }
  }

  const isSubmitting = isSignUp
    ? signUpForm.formState.isSubmitting
    : signInForm.formState.isSubmitting;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-12 inline-flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Sparkles size={22} />
              </span>
              <span className="text-xl font-semibold tracking-tight">
                Storm
              </span>
            </Link>

            <div className="mb-8">
              <p className="mb-3 text-sm font-medium text-slate-500">
                YOUR SOCIAL MEDIA WORKSPACE
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {isSignUp ? "Create your account" : "Welcome back"}
              </h1>
              <p className="mt-3 text-slate-600">
                {isSignUp
                  ? "Start organizing your content and managing your social presence."
                  : "Sign in to continue to your Storm workspace."}
              </p>
            </div>

            {serverError && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {serverError}
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
              >
                {notice}
              </div>
            )}

            {isSignUp ? (
              <form
                className="space-y-5"
                onSubmit={signUpForm.handleSubmit(handleSignUp)}
                noValidate
              >
                <div>
                  <label
                    htmlFor="signup-email"
                    className="mb-2 block text-sm font-medium"
                  >
                    Email address
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-invalid={Boolean(signUpForm.formState.errors.email)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    {...signUpForm.register("email")}
                  />
                  {signUpForm.formState.errors.email && (
                    <p className="mt-1 text-sm text-red-600">
                      {signUpForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="signup-password"
                    className="mb-2 block text-sm font-medium"
                  >
                    Password
                  </label>
                  <input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    aria-invalid={Boolean(signUpForm.formState.errors.password)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    {...signUpForm.register("password")}
                  />
                  {signUpForm.formState.errors.password && (
                    <p className="mt-1 text-sm text-red-600">
                      {signUpForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                  {!isSubmitting && <ArrowRight size={16} />}
                </Button>
              </form>
            ) : (
              <form
                className="space-y-5"
                onSubmit={signInForm.handleSubmit(handleSignIn)}
                noValidate
              >
                <div>
                  <label
                    htmlFor="signin-email"
                    className="mb-2 block text-sm font-medium"
                  >
                    Email address
                  </label>
                  <input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-invalid={Boolean(signInForm.formState.errors.email)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    {...signInForm.register("email")}
                  />
                  {signInForm.formState.errors.email && (
                    <p className="mt-1 text-sm text-red-600">
                      {signInForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="signin-password"
                    className="mb-2 block text-sm font-medium"
                  >
                    Password
                  </label>
                  <input
                    id="signin-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    aria-invalid={Boolean(signInForm.formState.errors.password)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    {...signInForm.register("password")}
                  />
                  {signInForm.formState.errors.password && (
                    <p className="mt-1 text-sm text-red-600">
                      {signInForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                  {!isSubmitting && <ArrowRight size={16} />}
                </Button>
              </form>
            )}

            <p className="mt-7 text-center text-sm text-slate-600">
              {isSignUp ? "Already have an account?" : "New to Storm?"}{" "}
              <Link
                to={isSignUp ? "/login" : "/signup"}
                className="font-semibold text-slate-900 underline underline-offset-4"
              >
                {isSignUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-slate-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 size-96 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-20 size-96 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative flex items-center gap-3 text-sm text-slate-300">
            <Sparkles size={18} />
            Plan, create, and publish with clarity.
          </div>

          <div className="relative max-w-lg">
            <p className="mb-5 text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              One workspace. More momentum.
            </p>
            <h2 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Make space for your next great idea.
            </h2>
            <p className="mt-6 max-w-md leading-7 text-slate-300">
              Bring your content planning, creative workflow, and publishing
              activities together in Storm.
            </p>
          </div>

          <p className="relative text-sm text-slate-400">
            Storm · Your social media workspace
          </p>
        </aside>
      </div>
    </main>
  );
}
