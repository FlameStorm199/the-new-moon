/**
 * FunctionsHttpError non espone il body della risposta nel messaggio (solo
 * "Edge Function returned a non-2xx status code"): il messaggio vero che le
 * nostre Edge Function scrivono in { error: "..." } sta nel body della
 * risposta originale, che il SDK espone come .context (una Response).
 * Condivisa tra i servizi che chiamano Edge Function proprie (admin-create-user,
 * manage-user-password, request-incontro-conoscitivo, ...).
 */
export async function extractFunctionErrorMessage(error: {
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
