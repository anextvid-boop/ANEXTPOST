import { google } from 'googleapis';
import {
  AuthProvider,
  AuthProviderAbstract,
} from '@postsider/backend/services/auth/providers.interface';

const defaultRedirect = () =>
  `${process.env.FRONTEND_URL}/auth/oauth/google/callback`;

const googleLoginClientId = () =>
  process.env.GOOGLE_LOGIN_CLIENT_ID?.trim() ||
  process.env.YOUTUBE_CLIENT_ID?.trim() ||
  '';

const googleLoginClientSecret = () =>
  process.env.GOOGLE_LOGIN_CLIENT_SECRET?.trim() ||
  process.env.YOUTUBE_CLIENT_SECRET?.trim() ||
  '';

const makeClient = (redirectUri: string) =>
  new google.auth.OAuth2({
    clientId: googleLoginClientId(),
    clientSecret: googleLoginClientSecret(),
    redirectUri,
  });

@AuthProvider({ provider: 'GOOGLE' })
export class GoogleProvider extends AuthProviderAbstract {
  generateLink(query?: { redirect_uri?: string }) {
    if (!googleLoginClientId() || !googleLoginClientSecret()) {
      return '';
    }
    const redirectUri = query?.redirect_uri || defaultRedirect();
    return makeClient(redirectUri).generateAuthUrl({
      access_type: 'online',
      prompt: 'consent',
      state: 'login',
      redirect_uri: redirectUri,
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
  }

  async getToken(code: string, redirectUri?: string) {
    const client = makeClient(redirectUri || defaultRedirect());
    const { tokens } = await client.getToken(code);
    return tokens.access_token!;
  }

  async getUser(providerToken: string) {
    const client = makeClient(defaultRedirect());
    client.setCredentials({ access_token: providerToken });
    const { data } = await google
      .oauth2({ version: 'v2', auth: client })
      .userinfo.get();

    return {
      id: data.id!,
      email: data.email!,
    };
  }
}
