import { cn } from "@/lib/utils";

interface Deadline {
  due_date: string;
  locked: boolean;
  item_type: string;
}

interface DeadlineCountdownProps {
  deadline: Deadline | null;
}

const ACTION_LABELS: Record<string, string> = {
  destination_vote: "vote",
  availability: "submit availability",
  budget_input: "submit preferences",
  confirmation: "confirm",
};

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const DeadlineCountdown = ({ deadline }: DeadlineCountdownProps) => {
  if (!deadline) return null;

  if (deadline.locked) {
    return (
      <span className="font-ui text-xs text-t-tertiary line-through">
        Closed
      </span>
    );
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(deadline.due_date);
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const action = ACTION_LABELS[deadline.item_type] || "respond";

  if (diffDays <= 0) {
    return (
      <span className="font-ui text-xs text-terra font-medium">
        Due today — {action} now
      </span>
    );
  }

  if (diffDays <= 2) {
    return (
      <span className="font-ui text-xs text-terra font-medium">
        Due {diffDays === 1 ? "tomorrow" : `in ${diffDays} days`} — {action} by {formatDate(deadline.due_date)}
      </span>
    );
  }

  return (
    <span className={cn("font-ui text-xs text-t-tertiary")}>
      Due in {diffDays} days — {action} by {formatDate(deadline.due_date)}
    </span>
  );
};

export default DeadlineCountdown;
