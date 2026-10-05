import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  }
>(({ className = '', variant = 'primary', type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={`button button-${variant} ${className}`} {...props} />
));
Button.displayName = 'Button';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`card ${className}`} {...props} />
  ),
);
Card.displayName = 'Card';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`input ${className}`} {...props} />
  ),
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...props }, ref) => (
    <select ref={ref} className={`select ${className}`} {...props} />
  ),
);
Select.displayName = 'Select';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = '', ...props }, ref) => (
  <textarea ref={ref} className={`textarea ${className}`} {...props} />
));
Textarea.displayName = 'Textarea';

export function Field({
  label,
  hint,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const generatedId = useId();
  const child =
    Children.count(children) === 1 && isValidElement(children)
      ? (children as ReactElement<{ id?: string; 'aria-describedby'?: string }>)
      : null;
  const id = child?.props.id || generatedId;
  return (
    <div className={`field ${className}`} {...props}>
      <label htmlFor={id}>{label}</label>
      {child
        ? cloneElement(child, {
            id,
            'aria-describedby': hint ? `${id}-hint` : child.props['aria-describedby'],
          })
        : children}
      {hint && (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function Badge({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`badge ${className}`} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="muted page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {description && <p className="muted">{description}</p>}
      {children}
    </div>
  );
}

export const Tabs = TabsPrimitive.Root;
export const TabsList = forwardRef<HTMLDivElement, TabsPrimitive.TabsListProps>(
  ({ className = '', ...props }, ref) => (
    <TabsPrimitive.List ref={ref} className={`tabs ${className}`} {...props} />
  ),
);
TabsList.displayName = 'TabsList';
export const TabsTrigger = forwardRef<HTMLButtonElement, TabsPrimitive.TabsTriggerProps>(
  ({ className = '', ...props }, ref) => (
    <TabsPrimitive.Trigger ref={ref} className={`tab ${className}`} {...props} />
  ),
);
TabsTrigger.displayName = 'TabsTrigger';
export const TabsContent = TabsPrimitive.Content;
