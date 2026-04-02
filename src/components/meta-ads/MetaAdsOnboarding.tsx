import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, Check } from 'lucide-react';

const steps = [
  {
    question: 'What type of business are you advertising?',
    key: 'business_type',
    options: ['Local Service', 'Ecommerce', 'Info Product / Course', 'Events', 'Personal Brand', 'Real Estate', 'Agency / Multi-Client', 'Other'],
  },
  {
    question: 'What are you trying to achieve?',
    key: 'goal',
    options: ['Generate Leads', 'Drive Sales', 'Increase Traffic', 'Build Awareness', 'Get Messages/DMs', 'Grow Followers'],
  },
  {
    question: 'What is your monthly ad budget?',
    key: 'budget',
    options: ['Under $500', '$500 - $2,000', '$2,000 - $5,000', '$5,000 - $10,000', '$10,000+', 'Not sure yet'],
  },
  {
    question: 'Do you already run Meta ads?',
    key: 'experience',
    options: ['Never ran ads before', 'Ran a few, not consistently', 'Running ads regularly', 'Advanced — managing multiple accounts'],
  },
  {
    question: 'How do you want AI to help you?',
    key: 'ai_role',
    options: ['Teach me as I go (Trainer Mode)', 'Just build faster (Expert Mode)', 'Both — train and build'],
  },
];

interface Props {
  onComplete: (answers: Record<string, string>) => void;
}

export default function MetaAdsOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const current = steps[step];

  const handleSelect = (option: string) => {
    const updated = { ...answers, [current.key]: option };
    setAnswers(updated);

    if (step < steps.length - 1) {
      setTimeout(() => setStep(step + 1), 200);
    } else {
      setTimeout(() => onComplete(updated), 300);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[600px] p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0">
            <Sparkles className="h-3 w-3 mr-1" /> Meta Ads AI
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">Let's set up your workspace</h2>
          <p className="text-sm text-muted-foreground">This helps the AI give you better recommendations</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Question */}
        <Card className="border-border/50">
          <CardContent className="p-6 space-y-4">
            <p className="text-lg font-semibold text-foreground">{current.question}</p>
            <div className="grid gap-2">
              {current.options.map((opt) => (
                <Button
                  key={opt}
                  variant={answers[current.key] === opt ? 'default' : 'outline'}
                  className="justify-start h-auto py-3 px-4 text-sm"
                  onClick={() => handleSelect(opt)}
                >
                  {answers[current.key] === opt && <Check className="h-4 w-4 mr-2 shrink-0" />}
                  {opt}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Step {step + 1} of {steps.length}
        </p>
      </div>
    </div>
  );
}
