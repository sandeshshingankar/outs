import AuthForm from './auth-form';

type AuthPageProps = {
  searchParams: Promise<{ mode?: string | string[] }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const { mode } = await searchParams;
  return <AuthForm initialMode={mode === 'login' ? 'login' : 'signup'} />;
}
