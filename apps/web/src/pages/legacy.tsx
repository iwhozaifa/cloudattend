// Interim pages carried over from the original single-file UI; replaced by the shadcn pages.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import type { Course, QrToken } from '@cloudattend/shared';
import { useAuth } from '@/auth/auth-context';
import { api, errorMessage } from '@/lib/api';

function Shell({ children }: { children: React.ReactNode }) {
  const { me, signOut } = useAuth();
  return <main className="legacy"><header><Link to="/">CloudAttend</Link><span>{me?.name}</span><button onClick={() => void signOut()}>Sign out</button></header><section>{children}</section></main>;
}

export function LegacyDashboard() {
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api<Course[]>('/courses') });
  return <Shell><h1>Dashboard</h1>{courses.isLoading ? <p>Loading courses…</p> : <div className="grid">{courses.data?.length ? courses.data.map((c) => <article key={c.courseId}><h2>{c.courseName}</h2><p>{c.courseCode} · {c.semester} · Section {c.section}</p><Link to={`/courses/${c.courseId}`}>Open course</Link></article>) : <p>No courses yet.</p>}</div>}</Shell>;
}

export function LegacyCourse() {
  const { courseId } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<{ sessionId: string; scheduledEndTime: string }>();
  const qr = useQuery({ queryKey: ['qr', session?.sessionId], enabled: Boolean(session), queryFn: () => api<QrToken>(`/sessions/${session!.sessionId}/qr-token`), refetchInterval: 30_000 });
  async function start() { setSession(await api(`/courses/${courseId}/sessions`, { method: 'POST', body: { durationMinutes: 10 } })); }
  return <Shell><h1>Course</h1><button onClick={() => void start()}>Start attendance</button>{session && <article><h2>Attendance open</h2>{qr.data && <QRCodeSVG value={`${location.origin}/check-in?token=${encodeURIComponent(qr.data.token)}`} size={260} />}<button onClick={async () => { await api(`/sessions/${session.sessionId}/close`, { method: 'POST' }); nav('/'); }}>Close attendance</button></article>}</Shell>;
}

export function LegacyCheckIn() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState('');
  const sent = useRef(false);
  useEffect(() => {
    const token = params.get('token');
    if (!token || sent.current) return;
    sent.current = true;
    history.replaceState({}, '', location.pathname);
    api('/attendance/check-in', { method: 'POST', body: { token } }).then(() => setMessage('Attendance Recorded')).catch((e) => setMessage(errorMessage(e)));
  }, [params]);
  return <Shell><h1>{message || 'Recording attendance…'}</h1></Shell>;
}
