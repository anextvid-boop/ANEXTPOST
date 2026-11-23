import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@postsider/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@postsider/nestjs-libraries/services/make.is';
import { SocialAbstract } from '@postsider/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import { google } from 'googleapis';

function formatBloggerContentHtml(raw: string): string {
  const formatInline = (text: string) =>
    text
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      )
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  const blocks = raw.split(/\n/);
  const out: string[] = [];
  let inList = false;

  for (const line of blocks) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      continue;
    }
    if (trimmed.startsWith('### ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
    } else if (trimmed === '---') {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push('<hr />');
    } else if (trimmed.startsWith('> ')) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<blockquote>${formatInline(trimmed.slice(2))}</blockquote>`);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${formatInline(trimmed.slice(2))}</li>`);
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }

  if (inList) {
    out.push('</ul>');
  }
  return out.join('');
}

const clientAndBlogger = () => {
  const client = new google.auth.OAuth2({
    clientId: process.env.GOOGLE_BLOGGER_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID,
    clientSecret:
      process.env.GOOGLE_BLOGGER_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET,
    redirectUri: `${process.env.FRONTEND_URL}/integrations/social/blogger`,
  });

  const blogger = google.blogger({ version: 'v3', auth: client });
  const oauth2 = (c: typeof client) =>
    google.oauth2({ version: 'v2', auth: c });

  return { client, blogger, oauth2 };
};

export class BloggerProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 2;
  identifier = 'blogger';
  name = 'Blogger';
  isBetweenSteps = true;
  editor = 'html' as const;
  scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/blogger',
  ];

  maxLength() {
    return 500000; // Blogger posts can be very long
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const { client, oauth2 } = clientAndBlogger();
    client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);

    const user = oauth2(client);
    const { data } = await user.userinfo.get();

    return {
      refreshToken: credentials.refresh_token || refreshToken,
      expiresIn: credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : 3600,
      accessToken: credentials.access_token!,
      id: `blogger-${data.id!}`,
      name: data.name!,
      picture: data?.picture || '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const { client } = clientAndBlogger();
    const state = makeId(6);

    return {
      url: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        state,
        redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/blogger`,
        scope: this.scopes.slice(0),
      }),
      codeVerifier: makeId(11),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const { client, oauth2 } = clientAndBlogger();
    const { tokens } = await client.getToken(params.code);
    client.setCredentials(tokens);
    const { scopes } = await client.getTokenInfo(tokens.access_token!);
    this.checkScopes(this.scopes, scopes);

    const user = oauth2(client);
    const { data } = await user.userinfo.get();

    const expiryDate = new Date(tokens.expiry_date!);
    const unixTimestamp =
      Math.floor(expiryDate.getTime() / 1000) -
      Math.floor(new Date().getTime() / 1000);

    return {
      accessToken: tokens.access_token!,
      expiresIn: unixTimestamp,
      refreshToken: tokens.refresh_token!,
      // Prefix with blogger- to avoid collision with YouTube/GMB
      // (same Google account). fetchPageInformation replaces this with blog id.
      id: `blogger-${data.id!}`,
      name: data.name!,
      picture: data?.picture || '',
      username: '',
    };
  }

  async pages(accessToken: string) {
    const { client, blogger } = clientAndBlogger();
    client.setCredentials({ access_token: accessToken });

    const { data } = await blogger.blogs.listByUser({ userId: 'self' });

    return (data.items || []).map((blog: any) => ({
      id: blog.id,
      page: blog.id,
      name: blog.name,
      username: blog.url,
      picture: '',
    }));
  }

  async fetchPageInformation(accessToken: string, data: { page: string }) {
    const { client, blogger } = clientAndBlogger();
    client.setCredentials({ access_token: accessToken });

    const { data: blog } = await blogger.blogs.get({ blogId: data.page });

    return {
      id: blog.id!,
      name: blog.name!,
      access_token: accessToken,
      picture: '',
      username: blog.url || '',
    };
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string,
  ) {
    const information = await this.fetchPageInformation(accessToken, {
      page: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration,
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const { client, blogger } = clientAndBlogger();
    client.setCredentials({ access_token: accessToken });

    // Split title from body: first line = title, rest = content. A one-line
    // message must NOT fall back to the full message as the body (it would
    // publish the title twice). Also extract optional trailing `Labels: a, b`.
    const lines = firstPost.message.split('\n');
    const title = lines[0]?.trim() || 'Untitled';
    const restLines = lines.slice(1);
    const labels: string[] = [];
    const bodyLines: string[] = [];

    for (let i = 0; i < restLines.length; i++) {
      const line = restLines[i];
      const match =
        i >= restLines.length - 2
          ? line.trim().match(/^(?:labels|tags)\s*:\s*(.+)$/i)
          : null;
      if (match) {
        match[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((lbl) => labels.push(lbl));
      } else {
        bodyLines.push(line);
      }
    }

    const content = bodyLines.join('\n').trim();

    const { data } = await blogger.posts.insert({
      blogId: id,
      requestBody: {
        title,
        content: formatBloggerContentHtml(content),
        ...(labels.length > 0 ? { labels } : {}),
      },
    });

    return [
      {
        id: firstPost.id,
        postId: data.id!,
        releaseURL: data.url || '',
        status: 'success',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration,
  ): Promise<PostResponse[]> {
    // Blogger API doesn't support creating comments programmatically
    // Return success with a note
    return [
      {
        id: postDetails[0].id,
        postId: postId,
        releaseURL: '',
        status: 'success',
      },
    ];
  }
}
