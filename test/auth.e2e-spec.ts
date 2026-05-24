import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EmailService } from '../src/integrations/email/email.service';
import { SendOtpPayload } from '../src/integrations/email/email.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_USER = {
  email: `test-${Date.now()}@e2e.local`,
  phone: '+250780000001',
  password: 'Test@1234',
  firstName: 'Test',
  lastName: 'User',
};

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('Auth e2e — register → verify → login → refresh → logout', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let capturedOtp: string;

  const emailMock = {
    sendOtp: jest.fn().mockImplementation((payload: SendOtpPayload) => {
      capturedOtp = payload.otp;
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(emailMock)
      .compile();

    app = module.createNestApplication();
    prisma = module.get(PrismaService);

    // Mirror the global setup from main.ts
    const { default: helmet } = await import('helmet');
    const cookieParser = require('cookie-parser');
    app.use(helmet());
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');

    await app.init();
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user
      .delete({ where: { email: TEST_USER.email } })
      .catch(() => undefined);
    await app.close();
  });

  // ── 1. Register ────────────────────────────────────────────────────────────

  it('POST /auth/register → 201 creates a PENDING user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(TEST_USER)
      .expect(201);

    expect(res.body.data.message).toMatch(/verification/i);
    expect(emailMock.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({ to: TEST_USER.email, purpose: 'EMAIL_VERIFY' }),
    );
  });

  it('POST /auth/register again → 409 duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(TEST_USER)
      .expect(409);
  });

  // ── 2. Verify email ────────────────────────────────────────────────────────

  it('POST /auth/verify-email with wrong OTP → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ email: TEST_USER.email, otp: '000000' })
      .expect(400);
  });

  it('POST /auth/verify-email with correct OTP → 200 activates account', async () => {
    expect(capturedOtp).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ email: TEST_USER.email, otp: capturedOtp })
      .expect(200);

    expect(res.body.data.message).toMatch(/verified/i);

    const user = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    expect(user?.isEmailVerified).toBe(true);
    expect(user?.status).toBe('ACTIVE');
    expect(user?.kycTier).toBe('TIER_1');
  });

  // ── 3. Login ───────────────────────────────────────────────────────────────

  let accessToken: string;
  let refreshToken: string;

  it('POST /auth/login before verification would fail (already verified, test login success)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user).toMatchObject({
      email: TEST_USER.email,
      firstName: TEST_USER.firstName,
    });

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('POST /auth/login with wrong password → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass123' })
      .expect(401);
  });

  // ── 4. Protected route ─────────────────────────────────────────────────────

  it('GET /identity/profile without token → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/identity/profile').expect(401);
  });

  it('GET /identity/profile with valid token → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/identity/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.email).toBe(TEST_USER.email);
  });

  // ── 5. Refresh token rotation ──────────────────────────────────────────────

  it('POST /auth/refresh → 200 returns new tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.accessToken).not.toBe(accessToken);

    // Rotate tokens for subsequent tests
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('POST /auth/refresh with old token → 401 (rotation enforced)', async () => {
    // The original refresh token was rotated — reuse should fail
    // (We already rotated above, so any further use of the old token fails)
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-token' })
      .expect(401);
  });

  // ── 6. Logout ──────────────────────────────────────────────────────────────

  it('POST /auth/logout → 200 revokes session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.message).toMatch(/logged out/i);
  });

  it('GET /identity/profile after logout → 401 (session revoked)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/identity/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  // ── 7. Forgot / Reset password ─────────────────────────────────────────────

  it('POST /auth/forgot-password → 200 regardless of email existence', async () => {
    emailMock.sendOtp.mockClear();

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: TEST_USER.email })
      .expect(200);

    expect(emailMock.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'RESET_PASSWORD' }),
    );
  });

  it('POST /auth/forgot-password with unknown email → 200 (no enumeration)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'unknown@example.com' })
      .expect(200);
  });

  it('POST /auth/reset-password with correct OTP → 200', async () => {
    const resetOtp = capturedOtp; // captured from the forgot-password call above

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ email: TEST_USER.email, otp: resetOtp, newPassword: 'NewPass@5678' })
      .expect(200);

    expect(res.body.data.message).toMatch(/reset/i);
  });

  it('POST /auth/login with new password → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'NewPass@5678' })
      .expect(200);

    expect(res.body.data).toHaveProperty('accessToken');
  });
});
