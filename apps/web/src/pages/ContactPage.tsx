import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button, Card, Field, Input, PageHeader, Textarea } from '@/components/ui';
export default function ContactPage() {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    setSuccess(false);
    try {
      await api('/feedback', {
        method: 'POST',
        body: JSON.stringify({ message, ...(email.trim() ? { email: email.trim() } : {}) }),
      });
      setSuccess(true);
      setMessage('');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Your feedback could not be submitted.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page legal-layout">
      <PageHeader
        eyebrow="KEEP THE CONVERSATION GOING"
        title="What can we make clearer?"
        description="Report an issue, suggest a tool, or ask the operator about this installation."
      />
      <Card>
        <div className="row" style={{ marginBottom: 22 }}>
          <span className="icon-box">
            <Mail />
          </span>
          <div>
            <h2>Send feedback</h2>
            <p className="muted small">
              Your message is stored for the deployment operator when feedback storage is
              configured.
            </p>
          </div>
        </div>
        {error && (
          <p className="error-banner" role="alert" style={{ marginBottom: 18 }}>
            {error}
          </p>
        )}
        {success && (
          <p className="success-banner" role="status" style={{ marginBottom: 18 }}>
            Your feedback was submitted. Thank you for helping improve the workspace.
          </p>
        )}
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field
            label="Email address (optional)"
            hint="Include an address if you would like the operator to be able to reply."
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              placeholder="you@example.com"
            />
          </Field>
          <Field
            label="Your message"
            hint="Describe the tool, input, expected result, and observed behavior. Leave passwords and private keys out."
          >
            <Textarea
              rows={8}
              minLength={10}
              maxLength={5000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
          </Field>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">{message.length}/5,000 characters</span>
            <Button type="submit" disabled={busy || message.trim().length < 10}>
              <Send size={14} />
              {busy ? 'Submitting…' : 'Send feedback'}
            </Button>
          </div>
        </form>
        <p className="muted small" style={{ marginTop: 20 }}>
          How information is handled: <Link to="/privacy">privacy policy</Link>.
        </p>
      </Card>
    </div>
  );
}
