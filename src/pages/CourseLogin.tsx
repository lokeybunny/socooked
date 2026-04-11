import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sparkles, Loader2, ArrowRight, Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function CourseLogin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user) navigate('/course/learn', { replace: true });
  }, [user, navigate]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/course/learn` },
    });

    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-[hsl(0,0%,3%)]"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;

  return (
    <div className="min-h-screen bg-[hsl(0,0%,3%)] text-white flex flex-col">
      <header className="border-b border-white/5 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex flex-col leading-none">
            <span className="text-[9px] tracking-[0.25em] uppercase text-emerald-400/70">Warren</span>
            <span className="text-sm font-light tracking-[0.15em] uppercase text-white/80">GURU</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm">
          {sent ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-6 w-6 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold mb-2">Check Your Email</h1>
              <p className="text-sm text-white/40 mb-4">
                We sent a magic link to <span className="text-white/70">{email}</span>. Click it to access your course.
              </p>
              <button onClick={() => setSent(false)} className="text-xs text-white/30 hover:text-white/50 transition-colors">
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-emerald-400" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
                  Access Your Course
                </h1>
                <p className="text-sm text-white/40">
                  Enter the email you used to purchase the course
                </p>
              </div>

              <form onSubmit={handleMagicLink} className="space-y-4">
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-black font-medium text-sm tracking-wide hover:bg-emerald-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRight className="h-4 w-4" /> Send Magic Link</>}
                </button>
                <p className="text-[10px] text-white/20 text-center">No password needed · We'll email you a login link</p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
