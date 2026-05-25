import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { default as request } from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EmailService, SendOtpPayload } from '../src/integrations/email/email.service';

// ─── Fixture ────────────────────────────────────────────────────────────────

const TEST_USER = {
  email: `e2e-${Date.now()}@imari.test`,
  phone: '+250780000099',
  password: 'Test@1234!',
  firstName: 'E2E',
  lastName: 'Tester',
};

describe('Auth e2e (register → verify → login → refresh → logout)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let capturedOtp: string;

  const emailMock = {
    sendOtp: jest.fn().mockImplementation((payload: SendOtpPayload) => {
      capturedOtp = payload.otp;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(emailMock)
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);

    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new PrismaExceptionFilter(), new AllExceptionsFilter());
    app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { email: TEST_USER.email } }).catch(() => undefined);
    await app.close();
  });

  // ── 1. Register ─────────────────────────────────────────────────────────────

  it('POST /auth/register → 201', async () => {
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

  // ── 2. Verify email ──────────────────────────────────────────────────────────

  it('POST /auth/verify-email with wrong OTP → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ email: TEST_USER.email, otp: '000000' })
      .expect(400);
  });

  it('POST /auth/verify-email with correct OTP → 200, activates account', async () => {
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

  // ── 3. Login ─────────────────────────────────────────────────────────────────

  let accessToken: string;
  let refreshToken: string;

  it('POST /auth/login with correct credentials → 200 with tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe(TEST_USER.email);

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('POST /auth/login with wrong password → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass@99' })
      .expect(401);
  });

  // ── 4. Protected route ───────────────────────────────────────────────────────

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

  // ── 5. Refresh token rotation ────────────────────────────────────────────────

  it('POST /auth/refresh → 200 with new tokens (rotation)', async () => {
    const oldAccess = accessToken;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.accessToken).not.toBe(oldAccess);

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('POST /auth/refresh with invalid token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-garbage-token' })
      .expect(401);
  });

  // ── 6. Logout ─────────────────────────────────────────────────────────────────

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

  // ── 7. Forgot / Reset password ───────────────────────────────────────────────

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

  it('POST /auth/forgot-password with unknown email → 200 (no user enumeration)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@nowhere.invalid' })
      .expect(200);
  });

  it('POST /auth/reset-password with correct OTP → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ email: TEST_USER.email, otp: capturedOtp, newPassword: 'NewPass@9999!' })
      .expect(200);

    expect(res.body.data.message).toMatch(/reset/i);
  });

  it('POST /auth/login with new password → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'NewPass@9999!' })
      .expect(200);

    expect(res.body.data).toHaveProperty('accessToken');
  });
});
