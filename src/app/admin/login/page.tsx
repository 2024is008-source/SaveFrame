import { LoginForm } from '../../../components/admin/LoginForm';
import { db } from '../../../admin/db';
import { ownerEmail } from '../../../admin/auth';
export default function LoginPage() {
  const configured=Boolean(ownerEmail())&&Number((db().prepare('SELECT COUNT(*) count FROM admin_users WHERE email=?').get(ownerEmail()) as any).count)>0;
  return <main className="admin-login"><div className="admin-login-brand"><span className="admin-mark">S</span><span>SaveFrame <small>Administration</small></span></div><section className="admin-login-panel"><p className="admin-eyebrow">Private workspace</p><h1>Welcome back.</h1><p className="admin-muted">Sign in to manage your website and review download activity.</p><LoginForm configured={configured}/></section><p className="admin-login-foot">Protected access · Server-side sessions</p></main>;
}
