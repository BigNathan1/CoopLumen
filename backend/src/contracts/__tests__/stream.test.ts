import { StellarService } from '../stellar';

describe('StellarService.streamPayments', () => {
  it('calls stream with correct parameters and returns cancel function', () => {
    const publicKey = 'GDKM3RKV3Y54WIBB4CYXUDV73FHRG52K3XU63P3GFT5ZZZ5J2JZZZZZZ';
    const cursor = '12345';
    const mockOnMessage = jest.fn();
    const mockOnError = jest.fn();

    const mockCancel = jest.fn();
    const mockStream = jest.fn().mockReturnValue(mockCancel);
    const mockCursor = jest.fn().mockReturnValue({ stream: mockStream });
    const mockForAccount = jest.fn().mockReturnValue({ cursor: mockCursor });
    const mockPayments = jest.fn().mockReturnValue({ forAccount: mockForAccount });

    jest.spyOn(StellarService.getServer(), 'payments').mockImplementation(mockPayments as any);

    const cancelFn = StellarService.streamPayments(publicKey, mockOnMessage, mockOnError, cursor);

    expect(mockPayments).toHaveBeenCalled();
    expect(mockForAccount).toHaveBeenCalledWith(publicKey);
    expect(mockCursor).toHaveBeenCalledWith(cursor);
    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({
        onmessage: expect.any(Function),
        onerror: expect.any(Function),
      })
    );

    // Call the cancel function
    cancelFn();
    expect(mockCancel).toHaveBeenCalled();

    // Trigger onmessage
    const streamArgs = mockStream.mock.calls[0][0];
    const mockMessage = { id: 'test-message' } as any;
    streamArgs.onmessage(mockMessage);
    expect(mockOnMessage).toHaveBeenCalledWith(mockMessage);

    // Trigger onerror
    const mockError = new Error('Network error');
    streamArgs.onerror(mockError);
    // Since toStellarError maps the error, we just check that mockOnError is called
    expect(mockOnError).toHaveBeenCalled();

    // We can also check that the error passed to mockOnError is an Error instance
    const errorArg = mockOnError.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
  });

  it('uses default cursor "now" if not provided', () => {
    const publicKey = 'GDKM3RKV3Y54WIBB4CYXUDV73FHRG52K3XU63P3GFT5ZZZ5J2JZZZZZZ';
    const mockOnMessage = jest.fn();
    const mockOnError = jest.fn();

    const mockStream = jest.fn().mockReturnValue(jest.fn());
    const mockCursor = jest.fn().mockReturnValue({ stream: mockStream });
    const mockForAccount = jest.fn().mockReturnValue({ cursor: mockCursor });
    const mockPayments = jest.fn().mockReturnValue({ forAccount: mockForAccount });

    jest.spyOn(StellarService.getServer(), 'payments').mockImplementation(mockPayments as any);

    StellarService.streamPayments(publicKey, mockOnMessage, mockOnError);

    expect(mockCursor).toHaveBeenCalledWith('now');
  });
});
