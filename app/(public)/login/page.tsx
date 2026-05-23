import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError =
    error === "auth"
      ? "That link has expired or is invalid. Please try signing in again."
      : undefined;

  return <LoginForm initialError={initialError} />;
}
