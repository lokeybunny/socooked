import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function Auth() {
  const { user, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-background"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        toast.success('Check your email to confirm your account!');
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md px-6">
        <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 sm:p-10 space-y-8 shadow-xl">
          {/* Logo */}
          <div className="text-center space-y-1">
            <div className="flex flex-col items-center leading-none mb-6">
              <span className="text-muted-foreground font-light text-[10px] tracking-[0.25em] uppercase">Warren</span>
              <span className="text-foreground font-light text-2xl tracking-[0.15em] uppercase">GURU</span>
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              {isSignUp ? 'Create account' : 'Welcome back'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isSignUp ? 'Get started with GURU' : 'Sign in to continue'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Full Name</Label>
                <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe" required className="h-11" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="h-11" />
            </div>
            <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={submitting}>
              {submitting ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>

          <div className="text-center">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
