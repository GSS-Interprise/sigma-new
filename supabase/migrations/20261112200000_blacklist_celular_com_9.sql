-- Bloqueios gravados sem o 9 do celular (o WhatsApp manda o número antigo de 8 dígitos) não casavam com o lead
-- (+55 DD 9XXXX-XXXX) e o lead seguia com opt_out = false (caso de 12/11). Grava a variante com o 9; o gatilho
-- da blacklist marca o lead e pausa as campanhas.
insert into public.blacklist (phone_e164, nome, origem, reason)
select '+55' || substr(b.phone_e164, 4, 2) || '9' || substr(b.phone_e164, 6), b.nome, b.origem,
       coalesce(b.reason, '') || ' (variante com o 9, 12/11)'
from public.blacklist b
where b.phone_e164 ~ '^\+55\d{2}[6-9]\d{7}$'
  and not exists (select 1 from public.blacklist x where x.phone_e164 = '+55' || substr(b.phone_e164, 4, 2) || '9' || substr(b.phone_e164, 6));
