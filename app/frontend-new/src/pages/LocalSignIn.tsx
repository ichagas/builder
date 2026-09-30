import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PronghornLogo } from "@/components/layout/PronghornLogo";

/**
 * Sign-in screen for local development (VITE_AUTH_MODE=mock): no Entra app
 * registration needed. Posts to the API's dev-login (AUTH_MODE=local only).
 */
export default function LocalSignIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, signInLocal } = useAuth();
  const [email, setEmail] = useState(t("auth.local.defaultEmail"));
  const [name, setName] = useState(t("auth.local.defaultName"));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate("/projects", { replace: true });
  }, [user, navigate]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!signInLocal || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signInLocal(email.trim(), name.trim());
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
    }
    // On success the auth context updates `user` and the effect above navigates.
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <PronghornLogo className="h-12 w-12 rounded-lg" />
          </div>
          <CardTitle className="text-2xl">{t("auth.local.title")}</CardTitle>
          <CardDescription>{t("auth.local.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 border-muted bg-muted/50" role="note">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="text-sm font-medium">{t("auth.local.notice")}</AlertDescription>
          </Alert>

          {error && (
            <Alert className="mb-4 border-destructive/50 bg-destructive/10" role="alert">
              <AlertDescription className="text-destructive">
                {t("auth.local.errorPrefix")}: {error}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="local-email">{t("auth.local.emailLabel")}</Label>
              <Input
                id="local-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="local-name">{t("auth.local.nameLabel")}</Label>
              <Input
                id="local-name"
                type="text"
                autoComplete="name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? t("auth.local.submitting") : t("auth.local.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
