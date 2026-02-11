import { FastifyInstance } from 'fastify';
import { tossClient, handleTossError } from '../tossClient';
import { supabaseAdmin } from '../supabaseClient';

interface ExchangeBody {
  code: string;
}

export async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/toss/exchange
  fastify.post<{ Body: ExchangeBody }>('/auth/toss/exchange', async (request, reply) => {
    const { code } = request.body;
    if (!code) {
      return reply.code(400).send({ error: 'Missing authentication code' });
    }

    try {
      console.log('[Auth] Exchanging Toss Code for Token...');
      // 1. Call Toss API to get Access Token (mTLS)
      // Endpoint: /api-partner/v1/apps-in-toss/user/oauth2/generate-token (Confirmed from docs)
      const tokenResponse = await tossClient.post(
        '/api-partner/v1/apps-in-toss/user/oauth2/generate-token',
        {
          code,
          grant_type: 'authorization_code',
          // client_id, client_secret might not be needed if mTLS is the sole auth, 
          // but often they are still required. Assuming mTLS is sufficient or strict.
          // If client_id is needed, add it from env.
          client_id: process.env.TOSS_CLIENT_ID, 
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // 2. Get User Info from Toss (using the access_token)
      // Endpoint: /api-partner/v1/apps-in-toss/user/profile (Hypothetical / Standard OIDC)
      // Or maybe the generate-token response already includes user info?
      // For now, let's assume we need to fetch profile or decode ID token.
      // If 'id_token' is present, we decode it.
      
      // MOCK for now: If we don't have a real profile endpoint, we use a mock ID based on the token
      // In production, you MUST call the profile endpoint or decode user_id from token.
      const tossUserId = 'toss_user_' + code.substring(0, 8); // temporary mock
      const tossEmail = `${tossUserId}@toss.im`; // temporary mock

      console.log(`[Auth] Toss Auth Successful. User: ${tossUserId}`);

      // 3. Upsert User in Supabase
      // Check if user exists by email (or metadata toss_id)
      const { data: existingUser } = await supabaseAdmin.rpc('get_user_id_by_email', { email: tossEmail });
      
      let userId = existingUser; // If RPC not avail, we might need another way.
      
      // Harder path: Admin List Users (Slow) -> Use 'createUser' or 'updateUser'
      // Better: standard 'signInWithIdToken' if Supabase supported Toss OIDC directly.
      // Since it doesn't, we create a custom user or link it.
      
      // Simple Approach: Create or Get User by Email
      // Note: We use a dummy password for this 'managed' user
      const dummyPassword = `TossLogin_${process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10)}`;
      
      // Try to sign in first (to check existence & get session)
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: tossEmail,
        password: dummyPassword,
      });

      let session = signInData.session;
      let user = signInData.user;

      if (signInError) {
        // Create user if not exists
        console.log('[Auth] Creating new Supabase user for Toss User...');
        const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
          email: tossEmail,
          password: dummyPassword,
          email_confirm: true,
          user_metadata: { toss_id: tossUserId, provider: 'toss' },
        });
        
        if (signUpError) {
          throw new Error('Failed to create user: ' + signUpError.message);
        }
        
        user = signUpData.user;
        
        // Immediately sign in to get session
        const { data: newSessionData } = await supabaseAdmin.auth.signInWithPassword({
          email: tossEmail,
          password: dummyPassword,
        });
        session = newSessionData.session;
      }

      if (!session || !user) {
        throw new Error('Failed to generate Supabase session');
      }

      // 4. Return Supabase Session to Client
      return reply.send({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: {
          id: user.id,
          email: user.email,
        },
      });

    } catch (error) {
      const err = handleTossError(error, 'Auth Exchange');
      return reply.code(400).send(err);
    }
  });
}
