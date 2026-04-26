import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';

export function SettingsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const pushToast = useToastStore((state) => state.pushToast);

  const [name, setName] = useState(user?.name ?? '');
  const [image, setImage] = useState(user?.image ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [deletionScheduledAt, setDeletionScheduledAt] = useState<string | null>(null);

  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const response = await userService.getMe();
        if (!active) {
          return;
        }

        setName(response.data.name ?? '');
        setImage(response.data.image ?? '');
        setEmail(response.data.email ?? '');
        setDeletionScheduledAt(response.data.deletionScheduledAt ?? null);
      } catch {
        if (!active) {
          return;
        }

        pushToast({
          title: 'Unable to load profile',
          message: 'Please refresh and try again.',
          type: 'error',
          durationMs: 3200,
        });
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [pushToast]);

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileSaving(true);

    try {
      const response = await userService.updateMe({
        name: name.trim(),
        image: image.trim() || undefined,
      });

      updateUser({
        name: response.data.name,
        image: response.data.image,
      });

      pushToast({
        title: 'Profile updated',
        message: 'Your name and image were saved.',
        type: 'success',
        durationMs: 2600,
      });
    } catch {
      pushToast({
        title: 'Update failed',
        message: 'Could not save your profile details.',
        type: 'error',
        durationMs: 3200,
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSavePassword = async (event: FormEvent) => {
    event.preventDefault();

    if (newPassword.length < 8) {
      pushToast({
        title: 'Password too short',
        message: 'New password must be at least 8 characters.',
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      pushToast({
        title: 'Password mismatch',
        message: 'New password and confirm password must match.',
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    setPasswordSaving(true);
    try {
      await userService.updatePassword({
        currentPassword,
        newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      pushToast({
        title: 'Password updated',
        message: 'Your password was changed successfully.',
        type: 'success',
        durationMs: 2600,
      });
    } catch {
      pushToast({
        title: 'Password update failed',
        message: 'Current password is incorrect or request was rejected.',
        type: 'error',
        durationMs: 3200,
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleScheduleDelete = async () => {
    const confirmed = window.confirm('Delete your account in 8 hours? This action is scheduled and cannot be undone from this screen.');
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    try {
      const response = await userService.scheduleDeleteMe();
      setDeletionScheduledAt(response.data.deletionAt);

      pushToast({
        title: 'Deletion scheduled',
        message: 'Your account is scheduled for deletion in 8 hours.',
        type: 'warning',
        durationMs: 3800,
      });

      clearAuth();
      navigate('/login');
    } catch {
      pushToast({
        title: 'Unable to schedule deletion',
        message: 'Please try again in a moment.',
        type: 'error',
        durationMs: 3200,
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell title="Settings" subtitle="Manage your profile details. Email cannot be changed.">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Profile</p>
          <form className="mt-4 space-y-4" onSubmit={handleSaveProfile}>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Email (read-only)</label>
              <input
                value={email}
                readOnly
                className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-400 outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Profile image URL</label>
              <input
                value={image}
                onChange={(event) => setImage(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
              />
            </div>
            <button
              type="submit"
              disabled={profileSaving}
              className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {profileSaving ? 'Saving...' : 'Save profile'}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Security</p>
          <form className="mt-4 space-y-4" onSubmit={handleSavePassword}>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
                required
              />
            </div>
            <button
              type="submit"
              disabled={passwordSaving}
              className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {passwordSaving ? 'Updating...' : 'Update password'}
            </button>
          </form>

          <div className="mt-8 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4">
            <p className="text-sm font-semibold text-rose-200">Delete account</p>
            <p className="mt-2 text-sm text-rose-100/90">
              Your account will be deleted automatically after 8 hours.
              {deletionScheduledAt ? ` Scheduled for: ${new Date(deletionScheduledAt).toLocaleString()}` : ''}
            </p>
            <button
              type="button"
              onClick={handleScheduleDelete}
              disabled={deleting}
              className="mt-3 rounded-full border border-rose-400/35 bg-rose-500/20 px-5 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? 'Scheduling...' : 'Schedule account deletion (8h)'}
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
