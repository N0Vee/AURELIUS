import { Container } from '@/components/layout';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Lock, Zap, Sliders, MessageSquare, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <Container size="md" className="text-center space-y-8">
          {/* Logo */}
          <div className="space-y-4">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--accent-gradient)] shadow-lg">
              <span className="text-4xl font-bold text-white">A</span>
            </div>
            <h1 className="text-5xl font-bold text-[var(--text-primary)]">
              AURELIUS
            </h1>
            <p className="text-xl text-[var(--text-secondary)]">
              Your Local Personal AI Assistant
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
            <Card className="text-left">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock size={20} className="text-[var(--safe)]" />
                  Privacy-First
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)]">
                  100% local execution. Your data never leaves your machine.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap size={20} className="text-[var(--sensitive)]" />
                  Ultra-Fast
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)]">
                  Optimized for your RTX 5060. No network latency.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sliders size={20} className="text-[var(--accent)]" />
                  OS Control
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)]">
                  Control apps, files, and media with natural language.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Link href="/chat">
              <Button size="lg" className="w-full sm:w-auto gap-2">
                <MessageSquare size={18} />
                Start Chatting
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2">
                <LayoutDashboard size={18} />
                View Dashboard
              </Button>
            </Link>
          </div>
        </Container>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-6">
        <Container>
          <p className="text-center text-sm text-[var(--text-muted)]">
            Powered by Llama 3.1 • Windows 11 • 100% Offline
          </p>
        </Container>
      </footer>
    </div>
  );
}
