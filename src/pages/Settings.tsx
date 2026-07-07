import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';

function SettingsLink({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-sky-400"
    >
      <span className="text-2xl">{icon}</span>
      <span>
        <span className="block font-medium text-gray-900 dark:text-gray-100">{title}</span>
        <span className="block text-sm text-gray-500">{description}</span>
      </span>
    </Link>
  );
}

export function Settings() {
  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <Link to="/" className="text-sm text-sky-500 hover:underline">
        ← Back to Home
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Display</h2>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <span className="text-sm text-gray-700 dark:text-gray-300">Dark mode</span>
          <ThemeToggle />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Training</h2>
        <SettingsLink
          to="/templates"
          icon="🎯"
          title="Training Options"
          description="Manage skills, milestones, and distractions"
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Account</h2>
        <SettingsLink
          to="/account"
          icon="🧑‍🏫"
          title="Account"
          description="Rename yourself or change your profile photo"
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Advanced</h2>
        <SettingsLink
          to="/diagnostics"
          icon="🩺"
          title="Diagnostics"
          description="Build info, sync status, and data recovery tools"
        />
      </section>
    </div>
  );
}
