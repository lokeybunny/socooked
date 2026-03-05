interface Step {
  title: string;
  content: React.ReactNode;
}

export default function DocsStepper({ steps }: { steps: Step[] }) {
  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
              {i + 1}
            </div>
            {i < steps.length - 1 && <div className="w-px flex-1 bg-border/50 mt-1" />}
          </div>
          <div className="pb-6 min-w-0">
            <h4 className="text-sm font-semibold mb-1">{step.title}</h4>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{step.content}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
