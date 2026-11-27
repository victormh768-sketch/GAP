/** Convierte errores técnicos en mensajes comprensibles para el usuario. */
export function friendlyError(e: unknown, action: 'load' | 'save' = 'save'): string {
  // DOMException (almacenamiento lleno) no siempre es `instanceof Error`: leemos las propiedades.
  const obj = typeof e === 'object' && e !== null ? (e as { message?: unknown; name?: unknown }) : null
  const raw = typeof e === 'string' ? e : typeof obj?.message === 'string' ? obj.message : ''
  const name = typeof obj?.name === 'string' ? obj.name : ''
  const msg = raw.toLowerCase()
  const verb = action === 'load' ? 'cargar tus datos' : 'guardar los cambios'

  if (name === 'QuotaExceededError' || msg.includes('quota')) {
    return `No se pudieron ${verb}: el almacenamiento de este dispositivo está lleno o bloqueado (¿navegación privada?).`
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')) {
    return `No se pudieron ${verb}: sin conexión. Inténtalo de nuevo cuando vuelvas a estar en línea.`
  }
  if (msg.includes('row-level security') || msg.includes('jwt') || msg.includes('permission denied')) {
    return 'Tu sesión ha caducado o no tienes permiso para esta acción. Vuelve a iniciar sesión.'
  }
  // Mensajes ya redactados para el usuario (validaciones propias) se muestran tal cual.
  if (raw && /^[A-ZÁÉÍÓÚÑ¿]/.test(raw) && !/[{}]|error:|exception/i.test(raw) && raw.length < 160) {
    return raw
  }
  return `No se pudieron ${verb}. Inténtalo de nuevo.`
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.'
  if (m.includes('already registered')) return 'Ese correo ya tiene cuenta. Prueba a entrar.'
  if (m.includes('email not confirmed')) return 'Confirma tu correo antes de entrar: revisa tu bandeja.'
  if (m.includes('password')) return 'La contraseña debe tener al menos 8 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  if (m.includes('fetch') || m.includes('network')) return 'Sin conexión. Comprueba tu red e inténtalo de nuevo.'
  return 'No se pudo completar la operación. Inténtalo de nuevo.'
}
