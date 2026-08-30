'use client';

import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import {
  FormProvider,
  useForm,
  useFormContext,
  type FieldError,
  type FieldValues,
  type Path,
  type RegisterOptions,
  type SubmitHandler,
  type UseFormProps,
  type UseFormRegisterReturn,
  type UseFormReturn,
} from 'react-hook-form';
import styles from './Form.module.css';

/** Message shown when a submit handler rejects without a usable message. */
const GENERIC_SUBMIT_ERROR = 'Something went wrong. Please try again.';

export interface FormProps<TFieldValues extends FieldValues> extends Omit<
  ComponentPropsWithoutRef<'form'>,
  'onSubmit' | 'children' | 'onError'
> {
  /** Called with validated values. Rejecting surfaces the reason via {@link FormError}. */
  onSubmit: SubmitHandler<TFieldValues>;
  /** Initial field values. */
  defaultValues?: UseFormProps<TFieldValues>['defaultValues'];
  /** When validation runs. Defaults to `onTouched`, which avoids shouting at empty fields. */
  mode?: UseFormProps<TFieldValues>['mode'];
  /** Validation resolver, e.g. a schema resolver. */
  resolver?: UseFormProps<TFieldValues>['resolver'];
  /**
   * An externally created `useForm()` instance, for callers that need to read
   * or reset the form from outside. Omit it to let `Form` own the instance.
   */
  form?: UseFormReturn<TFieldValues>;
  children: ReactNode | ((methods: UseFormReturn<TFieldValues>) => ReactNode);
}

/**
 * Wrapper around react-hook-form that owns the parts every form in the app
 * would otherwise re-implement: the form instance, the context that lets
 * nested fields register themselves, and the handling of a failed submit.
 *
 * The element is rendered with `noValidate` on purpose. Native constraint
 * bubbles are not announced consistently by screen readers and cannot be
 * styled; validation messages are rendered by {@link FormField} instead, wired
 * to their control with `aria-describedby`.
 *
 * A rejected `onSubmit` is caught and stored as the form-level `root` error, so
 * a failing API call renders in {@link FormError} rather than becoming an
 * unhandled rejection.
 *
 * @example
 * ```tsx
 * <Form<CreateCommunityValues> onSubmit={createCommunity}>
 *   <FormField name="name" label="Community name" required>
 *     {(field) => <input type="text" {...field} />}
 *   </FormField>
 *   <FormError />
 *   <FormSubmit>Create community</FormSubmit>
 * </Form>
 * ```
 */
export function Form<TFieldValues extends FieldValues>({
  onSubmit,
  defaultValues,
  mode = 'onTouched',
  resolver,
  form,
  children,
  className,
  ...formProps
}: FormProps<TFieldValues>) {
  // Hooks cannot be conditional, so the internal instance is always created and
  // simply ignored when the caller supplies its own.
  const internalForm = useForm<TFieldValues>({ defaultValues, mode, resolver });
  const methods = form ?? internalForm;

  const handleSubmit = methods.handleSubmit(async (values, event) => {
    methods.clearErrors('root');
    try {
      await onSubmit(values, event);
    } catch (error) {
      methods.setError('root', {
        type: 'submit',
        message: error instanceof Error && error.message ? error.message : GENERIC_SUBMIT_ERROR,
      });
    }
  });

  return (
    <FormProvider {...methods}>
      <form
        {...formProps}
        noValidate
        onSubmit={handleSubmit}
        className={[styles.form, className].filter(Boolean).join(' ')}
      >
        {typeof children === 'function' ? children(methods) : children}
      </form>
    </FormProvider>
  );
}

/** Props handed to a {@link FormField} child, ready to spread onto a control. */
export interface FormFieldRenderProps extends UseFormRegisterReturn {
  id: string;
  'aria-invalid': boolean;
  'aria-required': boolean | undefined;
  'aria-describedby': string | undefined;
}

export interface FormFieldProps<TFieldValues extends FieldValues> {
  /** Field path registered with react-hook-form. */
  name: Path<TFieldValues>;
  /** Visible label text, associated with the control through `htmlFor`. */
  label: string;
  /** Optional hint rendered under the label and referenced by the control. */
  description?: ReactNode;
  /** Marks the field required, both visually and via `aria-required`. */
  required?: boolean;
  /** Extra react-hook-form validation rules for this field. */
  rules?: RegisterOptions<TFieldValues, Path<TFieldValues>>;
  className?: string;
  /** Receives the props to spread onto the control. */
  children: (field: FormFieldRenderProps) => ReactNode;
}

/** Reads a possibly nested error such as `settings.currency` off the error tree. */
function findFieldError(errors: unknown, name: string): FieldError | undefined {
  const node = name
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        typeof current === 'object' && current !== null
          ? (current as Record<string, unknown>)[key]
          : undefined,
      errors
    );

  if (typeof node !== 'object' || node === null) return undefined;
  return node as FieldError;
}

/**
 * A labelled control with its description and validation message.
 *
 * The control itself is supplied by the caller through a render prop, so this
 * works for inputs, selects, textareas and custom widgets without the wrapper
 * having to know about every control the app will ever need. The props handed
 * back carry the react-hook-form registration plus the accessibility wiring:
 *
 * - `id` matched by the label's `htmlFor`, so clicking the label focuses the
 *   control and screen readers announce the two together;
 * - `aria-describedby` pointing at the description, the error, or both;
 * - `aria-invalid` while the field has an error;
 * - `aria-required` when the field is required, since `noValidate` means the
 *   native `required` attribute is not the source of truth.
 */
export function FormField<TFieldValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  required = false,
  rules,
  className,
  children,
}: FormFieldProps<TFieldValues>) {
  const context = useFormContext<TFieldValues>();
  if (!context) {
    throw new Error('FormField must be rendered inside a <Form>.');
  }

  const reactId = useId();
  const fieldId = `${reactId}-${name}`;
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;

  const error = findFieldError(context.formState.errors, name);
  const message = typeof error?.message === 'string' ? error.message : undefined;

  const describedBy =
    [description ? descriptionId : null, message ? errorId : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={fieldId} className={styles.label}>
        {label}
        {required && (
          <span aria-hidden="true" className={styles.requiredMark}>
            *
          </span>
        )}
      </label>

      {description && (
        <span id={descriptionId} className={styles.description}>
          {description}
        </span>
      )}

      {children({
        ...context.register(name, rules),
        id: fieldId,
        'aria-invalid': Boolean(message),
        'aria-required': required || undefined,
        'aria-describedby': describedBy,
      })}

      {message && (
        <span id={errorId} role="alert" className={styles.error}>
          {message}
        </span>
      )}
    </div>
  );
}

export interface FormErrorProps {
  className?: string;
}

/**
 * Renders the form-level `root` error set when a submit handler rejects.
 *
 * It is an assertive live region because it appears in response to a deliberate
 * submit: the reader is waiting for the outcome and needs to hear it without
 * hunting for it.
 */
export function FormError({ className }: FormErrorProps) {
  const { formState } = useFormContext();
  const message = formState.errors.root?.message;

  if (typeof message !== 'string' || !message) return null;

  return (
    <p role="alert" className={[styles.formError, className].filter(Boolean).join(' ')}>
      {message}
    </p>
  );
}

export interface FormSubmitProps extends ComponentPropsWithoutRef<'button'> {
  /** Label shown while the submit handler is in flight. Defaults to the children. */
  pendingLabel?: ReactNode;
}

/**
 * Submit button that disables itself while the handler is in flight, which
 * prevents a double submit, and reports the wait through `aria-busy`.
 */
export function FormSubmit({
  children,
  pendingLabel,
  className,
  disabled,
  ...buttonProps
}: FormSubmitProps) {
  const { formState } = useFormContext();
  const pending = formState.isSubmitting;

  return (
    <button
      type="submit"
      {...buttonProps}
      className={[styles.submit, className].filter(Boolean).join(' ')}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending && <span aria-hidden="true" className={styles.spinner} />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
