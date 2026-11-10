import { describe, expect, it } from 'vitest';
import { codigoValido, cpfValido, formatarCodigo, formatarCpf, identificadorValido, validarSenha } from './index';

describe('CPF', () => {
  it('confere os dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('123')).toBe(false);
  });
  it('formata enquanto digita', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(formatarCpf('5299')).toBe('529.9');
  });
});

describe('Código de acesso', () => {
  it('aceita com ou sem traços e recusa símbolos confusos', () => {
    expect(codigoValido('KAT-AB23-CD45')).toBe(true);
    expect(codigoValido('katab23cd45')).toBe(true);
    expect(codigoValido('KAT-AB0O-CD45')).toBe(false);
    expect(formatarCodigo('katab23cd45')).toBe('KAT-AB23-CD45');
  });
  it('o login aceita CPF ou código', () => {
    expect(identificadorValido('529.982.247-25')).toBe(true);
    expect(identificadorValido('KAT-AB23-CD45')).toBe(true);
    expect(identificadorValido('abc')).toBe(false);
  });
});

describe('Política de senha', () => {
  it('segue as regras do catequese-nsps', () => {
    expect(validarSenha('curta1')).toMatch(/8 caracteres/);
    expect(validarSenha('somenteletras')).toMatch(/letras e números/);
    expect(validarSenha('senha123')).toMatch(/comum/);
    expect(validarSenha('Abc529982x', '52998224725')).toMatch(/CPF/);
    expect(validarSenha('Catequese2026')).toBeNull();
  });
  it('respeita o limite de 72 bytes do bcrypt', () => {
    expect(validarSenha('a1'.repeat(37))).toMatch(/72/);
  });
});
