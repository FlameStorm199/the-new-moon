import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type UserTypeCode = 'customer' | 'future_customer' | 'assistant' | 'trainer' | 'admin';

// Stessa mappa di user-profile.service.ts: type_id → codice, senza passare
// dall'embed PostgREST "user_types(code)" (in prova tornato null anche con
// dati corretti lato DB — vedi commento lì).
const USER_TYPE_CODES: Record<number, UserTypeCode> = {
  1: 'customer',
  2: 'future_customer',
  3: 'assistant',
  4: 'trainer',
  5: 'admin',
};

export interface AdminUserRow {
  id: number;
  typeCode: UserTypeCode | '';
  name: string;
  surname: string;
  email: string | null;
  phone: string | null;
  dogName: string | null;
  validated: boolean;
}

export interface CreateUserInput {
  type_code: UserTypeCode;
  name: string;
  surname: string;
  email: string;
  phone?: string;
  dog_name?: string;
}

export interface CreateUserResult {
  user_id?: string;
  warning?: string;
}

/**
 * Wrapper delle due Edge Function admin-create-user e manage-user-password
 * (creazione utenti e flussi password, centralizzati lì per non aprire un
 * secondo percorso di scrittura su auth.users dal client — vedi i commenti
 * nei due file supabase/functions/*). functions.invoke() allega da solo sia
 * l'apikey sia, se loggato, il Bearer del chiamante: è quello che le due
 * funzioni si aspettano per verificare che sia davvero un admin a chiamare.
 */
@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly supabase = inject(SupabaseService).client;

  async list(): Promise<AdminUserRow[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, type_id, name, surname, email, phone, dog_name, validated')
      .is('deleted_at', null)
      .order('surname', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }
    return (data ?? []).map((row) => ({
      id: row['id'],
      typeCode: USER_TYPE_CODES[row['type_id']] ?? '',
      name: row['name'],
      surname: row['surname'],
      email: row['email'],
      phone: row['phone'],
      dogName: row['dog_name'],
      validated: row['validated'],
    }));
  }

  async createUser(input: CreateUserInput): Promise<CreateUserResult> {
    const { data, error } = await this.supabase.functions.invoke('admin-create-user', {
      body: input,
    });
    if (error) {
      throw new Error(await this.extractFunctionErrorMessage(error));
    }
    if (data?.error) {
      throw new Error(data.error);
    }
    return data as CreateUserResult;
  }

  async inviteUser(targetUserId: number): Promise<void> {
    await this.callManagePassword('admin_invite', targetUserId);
  }

  async forceResetPassword(targetUserId: number): Promise<void> {
    await this.callManagePassword('admin_force_reset', targetUserId);
  }

  private async callManagePassword(
    action: 'admin_invite' | 'admin_force_reset',
    targetUserId: number
  ): Promise<void> {
    const { data, error } = await this.supabase.functions.invoke('manage-user-password', {
      body: { action, target_user_id: targetUserId },
    });
    if (error) {
      throw new Error(await this.extractFunctionErrorMessage(error));
    }
    if (data?.error) {
      throw new Error(data.error);
    }
  }

  /**
   * FunctionsHttpError non espone il body della risposta nel messaggio
   * (solo "Edge Function returned a non-2xx status code"): il messaggio
   * vero che le nostre funzioni scrivono in { error: "..." } sta nel body
   * della risposta originale, che il SDK espone come .context (una Response).
   */
  private async extractFunctionErrorMessage(error: {
    message?: string;
    context?: Response;
  }): Promise<string> {
    try {
      const body = await error.context?.clone().json();
      if (body?.error) {
        return body.error as string;
      }
    } catch {
      // body non-JSON o già consumato: si usa il messaggio generico sotto.
    }
    return error.message ?? 'Richiesta fallita.';
  }
}
