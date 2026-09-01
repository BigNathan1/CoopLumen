import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form, FormError, FormField, FormSubmit } from '../Form';

interface CommunityValues {
  name: string;
  description: string;
}

/** A representative form: one required field, one optional field with a hint. */
function TestForm({
  onSubmit,
  defaultValues,
}: {
  onSubmit: (values: CommunityValues) => void | Promise<void>;
  defaultValues?: Partial<CommunityValues>;
}) {
  return (
    <Form<CommunityValues>
      onSubmit={onSubmit}
      defaultValues={{ name: '', description: '', ...defaultValues }}
      aria-label="Create community"
    >
      <FormField<CommunityValues>
        name="name"
        label="Community name"
        required
        rules={{ required: 'Community name is required' }}
      >
        {(field) => <input type="text" {...field} />}
      </FormField>

      <FormField<CommunityValues>
        name="description"
        label="Description"
        description="Shown on the community card."
      >
        {(field) => <textarea {...field} />}
      </FormField>

      <FormError />
      <FormSubmit>Create community</FormSubmit>
    </Form>
  );
}

describe('Form', () => {
  it('submits the entered values', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO');
    await user.type(screen.getByLabelText(/description/i), 'An eco-friendly community');
    await user.click(screen.getByRole('button', { name: /create community/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { name: 'EcoDAO', description: 'An eco-friendly community' },
        expect.anything()
      )
    );
  });

  it('populates controls from defaultValues', () => {
    render(<TestForm onSubmit={jest.fn()} defaultValues={{ name: 'EcoDAO' }} />);
    expect(screen.getByLabelText(/community name/i)).toHaveValue('EcoDAO');
  });

  it('sets noValidate so validation messages come from the app, not the browser', () => {
    const { container } = render(<TestForm onSubmit={jest.fn()} />);
    expect(container.querySelector('form')).toHaveAttribute('novalidate');
  });

  it('accepts a render prop so callers can read form state', async () => {
    const user = userEvent.setup();
    render(
      <Form<CommunityValues> onSubmit={jest.fn()} defaultValues={{ name: '', description: '' }}>
        {(methods) => (
          <>
            <FormField<CommunityValues> name="name" label="Community name">
              {(field) => <input type="text" {...field} />}
            </FormField>
            <output>{methods.watch('name')}</output>
          </>
        )}
      </Form>
    );

    await user.type(screen.getByLabelText(/community name/i), 'Eco');
    expect(screen.getByRole('status')).toHaveTextContent('Eco');
  });

  describe('validation', () => {
    it('blocks submission and shows the message when a required field is empty', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn();
      render(<TestForm onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: /create community/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Community name is required');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('marks the invalid control and links its message with aria-describedby', async () => {
      const user = userEvent.setup();
      render(<TestForm onSubmit={jest.fn()} />);

      await user.click(screen.getByRole('button', { name: /create community/i }));

      const input = await screen.findByLabelText(/community name/i);
      await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));

      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)).toHaveTextContent(
        'Community name is required'
      );
    });

    it('moves focus to the first invalid control on a failed submit', async () => {
      const user = userEvent.setup();
      render(<TestForm onSubmit={jest.fn()} />);

      await user.click(screen.getByRole('button', { name: /create community/i }));

      await waitFor(() => expect(screen.getByLabelText(/community name/i)).toHaveFocus());
    });

    it('clears the message once the field becomes valid', async () => {
      const user = userEvent.setup();
      render(<TestForm onSubmit={jest.fn()} />);

      await user.click(screen.getByRole('button', { name: /create community/i }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/community name/i), 'EcoDAO');

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });
  });

  describe('FormField accessibility', () => {
    it('associates each label with its control', () => {
      render(<TestForm onSubmit={jest.fn()} />);
      expect(screen.getByLabelText(/community name/i).tagName).toBe('INPUT');
      expect(screen.getByLabelText(/description/i).tagName).toBe('TEXTAREA');
    });

    it('gives each field a unique id even when rendered twice', () => {
      render(
        <>
          <TestForm onSubmit={jest.fn()} />
          <TestForm onSubmit={jest.fn()} />
        </>
      );

      const [first, second] = screen.getAllByLabelText(/community name/i);
      expect(first.id).not.toBe(second.id);
    });

    it('describes a control from its hint text', () => {
      render(<TestForm onSubmit={jest.fn()} />);

      const textarea = screen.getByLabelText(/description/i);
      expect(
        document.getElementById(textarea.getAttribute('aria-describedby') as string)
      ).toHaveTextContent('Shown on the community card.');
    });

    it('marks required fields with aria-required and a decorative asterisk', () => {
      render(<TestForm onSubmit={jest.fn()} />);

      expect(screen.getByLabelText(/community name/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/description/i)).not.toHaveAttribute('aria-required');
      expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    });

    it('is not aria-invalid before anything has failed', () => {
      render(<TestForm onSubmit={jest.fn()} />);
      expect(screen.getByLabelText(/community name/i)).toHaveAttribute('aria-invalid', 'false');
    });

    it('keeps controls in source order for keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<TestForm onSubmit={jest.fn()} />);

      await user.tab();
      expect(screen.getByLabelText(/community name/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/description/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /create community/i })).toHaveFocus();
    });

    it('focuses the control when its label is clicked', async () => {
      const user = userEvent.setup();
      render(<TestForm onSubmit={jest.fn()} />);

      await user.click(screen.getByText('Community name'));
      expect(screen.getByLabelText(/community name/i)).toHaveFocus();
    });
  });

  describe('FormError', () => {
    it('renders nothing until a submit fails', () => {
      render(<TestForm onSubmit={jest.fn()} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('announces the reason a rejected submit handler gave', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockRejectedValue(new Error('A community with this name exists.'));
      render(<TestForm onSubmit={onSubmit} defaultValues={{ name: 'EcoDAO' }} />);

      await user.click(screen.getByRole('button', { name: /create community/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'A community with this name exists.'
      );
    });

    it('falls back to a generic message when the rejection carries none', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockRejectedValue(new Error(''));
      render(<TestForm onSubmit={onSubmit} defaultValues={{ name: 'EcoDAO' }} />);

      await user.click(screen.getByRole('button', { name: /create community/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong. Please try again.'
      );
    });

    it('clears the previous failure when the form is submitted again', async () => {
      const user = userEvent.setup();
      const onSubmit = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network unreachable'))
        .mockResolvedValueOnce(undefined);
      render(<TestForm onSubmit={onSubmit} defaultValues={{ name: 'EcoDAO' }} />);

      const submit = screen.getByRole('button', { name: /create community/i });
      await user.click(submit);
      expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable');

      await user.click(submit);
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });
  });

  describe('FormSubmit', () => {
    it('disables itself and reports aria-busy while submitting', async () => {
      const user = userEvent.setup();
      let release: () => void = () => undefined;
      const onSubmit = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );
      render(<TestForm onSubmit={onSubmit} defaultValues={{ name: 'EcoDAO' }} />);

      const submit = screen.getByRole('button', { name: /create community/i });
      await user.click(submit);

      await waitFor(() => expect(submit).toBeDisabled());
      expect(submit).toHaveAttribute('aria-busy', 'true');

      release();
      await waitFor(() => expect(submit).toBeEnabled());
    });

    it('shows a pending label while in flight', async () => {
      const user = userEvent.setup();
      let release: () => void = () => undefined;
      const onSubmit = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );

      render(
        <Form<CommunityValues>
          onSubmit={onSubmit}
          defaultValues={{ name: 'EcoDAO', description: '' }}
        >
          <FormSubmit pendingLabel="Creating...">Create community</FormSubmit>
        </Form>
      );

      await user.click(screen.getByRole('button', { name: /create community/i }));

      expect(await screen.findByRole('button', { name: /creating/i })).toBeInTheDocument();

      release();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /create community/i })).toBeEnabled()
      );
    });

    it('honours an explicit disabled prop', () => {
      render(
        <Form<CommunityValues> onSubmit={jest.fn()} defaultValues={{ name: '', description: '' }}>
          <FormSubmit disabled>Create community</FormSubmit>
        </Form>
      );

      expect(screen.getByRole('button', { name: /create community/i })).toBeDisabled();
    });

    it('submits when activated from the keyboard', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn();
      render(<TestForm onSubmit={onSubmit} defaultValues={{ name: 'EcoDAO' }} />);

      screen.getByRole('button', { name: /create community/i }).focus();
      await user.keyboard('{Enter}');

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    });
  });
});
