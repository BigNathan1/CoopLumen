import request from 'supertest';
import app from '../../../app';
import { submitSignedXdr } from '../../../contracts/transactions';
import { StellarError } from '../../../contracts/errors';

jest.mock('../../../contracts/transactions', () => ({
  submitSignedXdr: jest.fn(),
}));

describe('POST /api/v1/transactions/submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when the XDR is missing', async () => {
    const res = await request(app).post('/api/v1/transactions/submit').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(submitSignedXdr).not.toHaveBeenCalled();
  });

  it('returns 400 when the XDR is an empty string', async () => {
    const res = await request(app).post('/api/v1/transactions/submit').send({ xdr: '' });

    expect(res.status).toBe(400);
    expect(res.body.meta.errors[0].path).toBe('xdr');
  });

  it('returns the transaction hash on a successful submission', async () => {
    (submitSignedXdr as jest.Mock).mockResolvedValue('abc123');

    const res = await request(app)
      .post('/api/v1/transactions/submit')
      .send({ xdr: 'AAAAAgAAAAA=' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { hash: 'abc123' } });
    expect(submitSignedXdr).toHaveBeenCalledWith('AAAAAgAAAAA=');
  });

  it('surfaces a mapped Horizon failure with its status and message', async () => {
    (submitSignedXdr as jest.Mock).mockRejectedValue(
      new StellarError('Transaction sequence number is out of date.', { status: 422 })
    );

    const res = await request(app)
      .post('/api/v1/transactions/submit')
      .send({ xdr: 'AAAAAgAAAAA=' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      data: null,
      error: 'Transaction sequence number is out of date.',
    });
  });
});
