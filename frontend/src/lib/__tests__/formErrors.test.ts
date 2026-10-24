import { setSchemaFieldErrors } from '@/lib/formErrors';

describe('setSchemaFieldErrors', () => {
  let mockSetError: jest.Mock;

  beforeEach(() => {
    mockSetError = jest.fn();
  });

  it('maps field errors to react-hook-form setError', () => {
    const errors = {
      email: 'Email is required',
      password: 'Password must be at least 8 characters',
    };

    const firstField = setSchemaFieldErrors(mockSetError, errors);

    expect(mockSetError).toHaveBeenCalledWith('email', {
      type: 'validation',
      message: 'Email is required',
    });
    expect(mockSetError).toHaveBeenCalledWith('password', {
      type: 'validation',
      message: 'Password must be at least 8 characters',
    });
    expect(firstField).toBe('email');
  });

  it('returns the first field that had an error', () => {
    const errors = {
      username: 'Username is taken',
      email: 'Email is invalid',
    };

    const firstField = setSchemaFieldErrors(mockSetError, errors);

    expect(firstField).toBe('username');
  });

  it('maps unknown fields to root-level errors', () => {
    const errors = {
      'unknown.nested.field': 'This field is invalid',
    };

    const firstField = setSchemaFieldErrors(mockSetError, errors, ['email', 'password']);

    expect(mockSetError).toHaveBeenCalledWith('root', {
      type: 'validation',
      message: 'This field is invalid',
    });
    expect(firstField).toBeUndefined();
  });

  it('maps "requestBody" errors to root-level', () => {
    const errors = {
      requestBody: 'Invalid request format',
    };

    const firstField = setSchemaFieldErrors(mockSetError, errors);

    expect(mockSetError).toHaveBeenCalledWith('root', {
      type: 'validation',
      message: 'Invalid request format',
    });
    expect(firstField).toBeUndefined();
  });

  it('maps empty string field names to root-level', () => {
    const errors = {
      '': 'Generic error',
    };

    const firstField = setSchemaFieldErrors(mockSetError, errors);

    expect(mockSetError).toHaveBeenCalledWith('root', {
      type: 'validation',
      message: 'Generic error',
    });
    expect(firstField).toBeUndefined();
  });

  it('filters fields by knownFields when provided', () => {
    const errors = {
      email: 'Email is required',
      unknownField: 'Unknown field error',
      password: 'Password is required',
    };
    const knownFields = ['email', 'password'];

    const firstField = setSchemaFieldErrors(mockSetError, errors, knownFields);

    expect(mockSetError).toHaveBeenCalledWith('email', {
      type: 'validation',
      message: 'Email is required',
    });
    expect(mockSetError).toHaveBeenCalledWith('password', {
      type: 'validation',
      message: 'Password is required',
    });
    expect(mockSetError).toHaveBeenCalledWith('root', {
      type: 'validation',
      message: 'Unknown field error',
    });
    expect(firstField).toBe('email');
  });

  it('handles empty error objects', () => {
    const errors = {};

    const firstField = setSchemaFieldErrors(mockSetError, errors);

    expect(mockSetError).not.toHaveBeenCalled();
    expect(firstField).toBeUndefined();
  });

  it('returns the first known field even when unknown fields come first in iteration order', () => {
    const errors = {
      unknownField1: 'Unknown error',
      email: 'Email is invalid',
      unknownField2: 'Another unknown error',
      password: 'Password is weak',
    };
    const knownFields = ['email', 'password'];

    const firstField = setSchemaFieldErrors(mockSetError, errors, knownFields);

    expect(firstField).toBe('email');
  });

  it('calls setError for each error exactly once', () => {
    const errors = {
      field1: 'Error 1',
      field2: 'Error 2',
      field3: 'Error 3',
    };

    setSchemaFieldErrors(mockSetError, errors);

    expect(mockSetError).toHaveBeenCalledTimes(3);
  });

  describe('edge cases', () => {
    it('handles errors with multiple root-level and field-level errors mixed', () => {
      const errors = {
        '': 'Generic error',
        email: 'Email error',
        requestBody: 'Request error',
        password: 'Password error',
      };

      const firstField = setSchemaFieldErrors(mockSetError, errors);

      expect(mockSetError).toHaveBeenCalledWith('root', {
        type: 'validation',
        message: 'Generic error',
      });
      expect(mockSetError).toHaveBeenCalledWith('root', {
        type: 'validation',
        message: 'Request error',
      });
      expect(mockSetError).toHaveBeenCalledWith('email', {
        type: 'validation',
        message: 'Email error',
      });
      expect(mockSetError).toHaveBeenCalledWith('password', {
        type: 'validation',
        message: 'Password error',
      });
      expect(firstField).toBe('email');
    });
  });
});
