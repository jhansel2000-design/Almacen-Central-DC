-- Tablón — noticia Control de Turnos (choferes)
insert into public.hub_news (title, body, published_at, published_by, active, pinned, image_url, link_url, theme)
select
  'Próximamente: Control de Turnos',
  'Cómo nos ayuda con los choferes:
• Turno único al llegar — sin filas ni confusión
• Despacho, liquidación y nota de crédito en segundos desde el celular
• Pantalla en vivo para saber cuándo les toca entrar
• Menos espera en muelle, más entregas al día',
  now(),
  'Almacén Central DC',
  true,
  true,
  'assets/img/turnos-hub-banner.svg',
  'turnos.html',
  'turnos'
where not exists (
  select 1 from public.hub_news where theme = 'turnos' and title = 'Próximamente: Control de Turnos'
);
