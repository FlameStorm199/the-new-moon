import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface UserProfile {
  id: number;
  typeCode: string;
  name: string;
  surname: string;
  email: string | null;
  phone: string | null;
  dogName: string | null;
  validated: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly supabase = inject(SupabaseService).client;

  /** Profilo public.users dell'utente autenticato corrente, o null se non loggato. */
  async getMyProfile(): Promise<UserProfile | null> {
    const { data: authData } = await this.supabase.auth.getUser();
    if (!authData.user) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('users')
      .select('id, name, surname, email, phone, dog_name, validated, user_types(code)')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (error || !data) {
      return null;
    }

    const userType = data['user_types'] as { code: string } | { code: string }[] | null;
    const typeCode = Array.isArray(userType) ? userType[0]?.code : userType?.code;

    return {
      id: data['id'],
      name: data['name'],
      surname: data['surname'],
      email: data['email'],
      phone: data['phone'],
      dogName: data['dog_name'],
      validated: data['validated'],
      typeCode: typeCode ?? '',
    };
  }
}
