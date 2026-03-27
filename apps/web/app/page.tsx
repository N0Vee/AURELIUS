import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/layout';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Lock, Zap, Sliders, MessageSquare, LayoutDashboard } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <Container size="md" className="space-y-8 text-center">
          {/* Logo */}
          <div className="space-y-5">
            <div className="mx-auto flex justify-center">
              <div className="relative h-32 w-32 md:h-40 md:w-40">
                <Image
                  src="/images/aurelius-icon.png"
                  alt="Aurelius logo"
                  fill
                  priority
                  className="object-contain drop-shadow-[0_0_32px_rgba(245,158,11,0.28)]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-5xl font-bold tracking-tight text-[var(--text-primary)] md:text-6xl">
                Aurelius
              </h1>
              <p className="text-xl text-[var(--text-secondary)] md:text-2xl">
                Your Local Personal AI Assistant
              </p>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="text-left">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock size={20} className="text-[var(--safe)]" />
                  Privacy-First
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)]">
                  Local-first architecture with configurable providers and guarded tool execution.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap size={20} className="text-[var(--sensitive)]" />
                  Tool-Powered
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)]">
                  Search the web, inspect files, launch apps, and automate tasks with approval controls.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sliders size={20} className="text-[var(--accent)]" />
                  Runtime Configurable
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)]">
                  Switch LLM providers, tune prompts, and configure file and tool boundaries from Settings.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/chat">
              <Button size="lg" className="w-full gap-2 sm:w-auto">
                <MessageSquare size={18} />
                Start Chatting
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="w-full gap-2 sm:w-auto">
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
            Built for Windows • Local-first • Guarded AI automation
          </p>
        </Container>
      </footer>
    </div>
  );
}
