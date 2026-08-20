import type { Dictionary } from "./en";

/** Spanish translations. Typed against `en`, so nothing can go missing. */
export const es: Dictionary = {
  // ---------------------------------------------------------------- general
  "common.back_home": "Volver a tu casa",
  "common.back": "Atrás",
  "common.continue": "Continuar",
  "common.home": "Inicio",
  "common.loading": "Cargando…",
  "common.saving": "Guardando…",
  "common.save": "Guardar",
  "common.cancel": "Cancelar",
  "common.none_yet": "Ninguno todavía",
  "common.language": "Idioma",
  "common.english": "English",
  "common.spanish": "Español",
  "common.language_saved": "Idioma actualizado",
  "common.language_save_failed": "No pudimos guardar tu idioma. Inténtalo de nuevo.",

  // ------------------------------------------------------------------ shell
  "nav.home": "Inicio",
  "nav.todo": "Pendientes",
  "nav.docs": "Docs",
  "nav.documents": "Documentos",
  "nav.services": "Servicios",
  "nav.report": "Informe",

  // ----------------------------------------------------------- account menu
  "account.title": "Cuenta",
  "account.aria": "Cuenta",
  "account.fallback_name": "Tu cuenta",
  "account.role.homeowner": "Propietario",
  "account.role.agent": "Agente",
  "account.role.lender": "Prestamista",
  "account.request_service": "Solicitar un servicio",
  "account.my_home": "Mi casa",
  "account.browse_services": "Ver servicios",
  "account.sign_out": "Cerrar sesión",
  "account.agent_dashboard": "Panel de agente",
  "account.lender_dashboard": "Panel de prestamista",
  "account.admin_dashboard": "Panel de administrador",

  // -------------------------------------------------------------- dashboard
  "dash.welcome_back": "Bienvenido de nuevo",
  "dash.your_home": "Tu casa",
  "dash.request": "Solicitar",
  "dash.take_tour": "Ver el recorrido",

  "dash.care.label": "Cuidado del hogar",
  "dash.care.start": "Empecemos",
  "dash.care.late": "{count} atrasadas",
  "dash.care.coming_up": "{count} próximas",
  "dash.care.all_good": "Todo en orden",
  "dash.care.empty": "Cuéntanos un poco sobre tu casa y armaremos tu lista de pendientes.",
  "dash.care.start_with": "Empieza con tu {item}.",
  "dash.care.nothing": "Hoy no hay nada pendiente. Te avisamos cuando eso cambie.",
  "dash.care.action": "Abrir cuidado del hogar",

  "dash.money.label": "Valor y plusvalía",
  "dash.money.equity_line": "Tienes {amount} de plusvalía.",
  "dash.money.equity_line_pct": "Tienes {amount} de plusvalía — el {pct}% de tu casa.",
  "dash.money.matching": "Todavía estamos cruzando tu casa con los registros públicos.",
  "dash.money.add_address": "Agrega tu dirección y traeremos tu valor y plusvalía.",
  "dash.money.action": "Ver los números",

  "dash.assistant.label": "Asistente del Hogar",
  "dash.assistant.sentence": "Pregunta lo que quieras sobre tu casa — respondemos con tus propios registros.",
  "dash.assistant.action": "Hacer una pregunta",

  "dash.docs.label": "Documentos",
  "dash.docs.saved": "{count} guardados",
  "dash.docs.add_inspection": "Sube tu informe de inspección y lo convertimos en una lista de pendientes.",
  "dash.docs.findings_one": "Leímos tu informe de inspección y encontramos 1 cosa que vigilar.",
  "dash.docs.findings_many": "Leímos tu informe de inspección y encontramos {count} cosas que vigilar.",
  "dash.docs.saved_searchable": "Tus documentos están guardados y se pueden buscar.",
  "dash.docs.action_open": "Abrir documentos",
  "dash.docs.action_add": "Agregar un documento",

  // --------------------------------------------------------------- sections
  "page.care.title": "Cuidado del hogar",
  "page.docs.title": "Tus documentos",
  "page.money.title": "Valor y plusvalía",
  "page.assistant.title": "Asistente del Hogar",

  // ------------------------------------------------------------- onboarding
  "ob.step_of": "Paso {current} de {total}",
  "ob.step.about": "Sobre ti",
  "ob.step.home": "Tu casa",
  "ob.step.goals": "Tus metas",
  "ob.step.review": "Revisar",
  "ob.about.title": "Conozcámonos",
  "ob.about.desc": "Usaremos esto para personalizar tu Perfil del Hogar.",
  "ob.field.full_name": "Nombre completo",
  "ob.field.email": "Correo electrónico",
  "ob.field.phone": "Teléfono",
  "ob.field.password": "Crea una contraseña",
  "ob.field.confirm_password": "Confirma la contraseña",
  "ob.field.language": "Idioma preferido",
  "ob.ph.name": "Juana Pérez",
  "ob.ph.email": "juana@ejemplo.com",
  "ob.ph.phone": "(555) 123-4567",
  "ob.ph.password": "Al menos 6 caracteres",
  "ob.ph.confirm": "Vuelve a escribir tu contraseña",
  "ob.home.title": "Sobre tu casa",
  "ob.home.desc": "Esto nos ayuda a personalizar el valor y el mantenimiento.",
  "ob.field.address": "Dirección de la casa",
  "ob.field.home_type": "Tipo de vivienda",
  "ob.field.year_built": "Año de construcción",
  "ob.home_type.single": "Casa unifamiliar",
  "ob.home_type.town": "Casa adosada",
  "ob.home_type.condo": "Condominio",
  "ob.home_type.multi": "Multifamiliar",
  "ob.goals.title": "¿Cuáles son tus metas?",
  "ob.goals.desc": "Elige todas las que apliquen.",
  "ob.goal.save": "Ahorrar dinero",
  "ob.goal.maintenance": "Estar al día con el mantenimiento",
  "ob.goal.value": "Aumentar el valor de mi casa",
  "ob.goal.remodel": "Remodelar o renovar",
  "ob.review.title": "Revisa y crea tu perfil",
  "ob.review.desc": "Confirma tus datos para abrir tu panel.",
  "ob.review.name": "Nombre",
  "ob.review.email": "Correo",
  "ob.review.phone": "Teléfono",
  "ob.review.address": "Dirección",
  "ob.review.home_type": "Tipo de vivienda",
  "ob.review.year_built": "Año de construcción",
  "ob.review.goals": "Metas",
  "ob.review.language": "Idioma",
  "ob.review.ready": "Todo listo: tu panel está preparado.",
  "ob.create_profile": "Crear perfil",
  "ob.creating": "Creando…",
  "ob.sign_in_instead": "Mejor inicia sesión",
  "ob.err.email": "Escribe tu correo en el primer paso.",
  "ob.err.password": "Elige una contraseña de al menos 6 caracteres.",
  "ob.err.password_match": "Las contraseñas no coinciden.",
  "ob.err.city_state": "Agrega la ciudad y el estado (o el código postal) de tu casa para poder traer sus registros de propiedad.",
  "ob.err.email_taken": "Ya existe una cuenta con este correo.",
  "ob.err.generic": "No pudimos crear tu cuenta. Inténtalo de nuevo.",
  "ob.err.confirm_email": "Revisa tu correo para confirmar la cuenta y luego inicia sesión para terminar tu perfil.",
  "ob.err.unknown": "Algo salió mal. Inténtalo de nuevo.",
  // -------------------------------------------------- cuidado de la casa
  "care.loading": "Cargando tu plan de cuidado del hogar…",
  "care.hero.eyebrow": "Cuidado del hogar",
  "care.hero.title": "Ocúpate de esto",
  "care.hero.subtitle": "Lo que tu casa necesita, empezando por lo más importante.",
  "care.status.setup": "Cuéntanos un poco sobre tu casa y armaremos tu lista de tareas.",
  "care.status.late_one": "1 cosa está atrasada.",
  "care.status.late_many": "{count} cosas están atrasadas.",
  "care.status.late_one_soon": "1 cosa está atrasada y {soon} vienen pronto.",
  "care.status.late_many_soon": "{count} cosas están atrasadas y {soon} vienen pronto.",
  "care.status.soon_one": "Nada está atrasado. 1 cosa viene pronto.",
  "care.status.soon_many": "Nada está atrasado. {count} cosas vienen pronto.",
  "care.status.all_good": "Hoy todo se ve bien. Te avisaremos cuando eso cambie.",
  "care.action.add_details": "Agregar datos de la casa",
  "care.action.start": "Empieza por esta",
  "care.connect.none": "Sube un informe de inspección y esta lista será mucho más útil.",
  "care.connect.findings_one": "Tu informe de inspección agregó 1 nota a esta lista.",
  "care.connect.findings_many": "Tu informe de inspección agregó {count} notas a esta lista.",
  "care.connect.findings_one_urgent":
    "Tu informe de inspección agregó 1 nota a esta lista: {urgent} requieren atención pronto.",
  "care.connect.findings_many_urgent":
    "Tu informe de inspección agregó {count} notas a esta lista: {urgent} requieren atención pronto.",
  "care.connect.label": "Ir a Documentos",
  "care.empty": "Agrega los datos de tu casa y te diremos qué hace falta hacer, y cuándo.",
  "care.legend.late": "Atrasado",
  "care.legend.soon": "Viene pronto",
  "care.legend.ok": "Todo bien",
  "care.kind.system": "Cosas grandes",
  "care.kind.routine": "Tarea rápida",
  "care.timing.late": "Atrasado",
  "care.timing.soon": "Viene pronto",
  "care.timing.years_left": "Le quedan unos {years} años",
  "care.detail.overdue":
    "Instalado alrededor de {year}. Ya duró más que la mayoría, así que conviene planearlo.",
  "care.detail.due_soon": "Instalado alrededor de {year}. Se acerca al final de su vida útil.",
  "care.detail.ok": "Instalado alrededor de {year}. Por ahora se ve bien.",
  "care.routine.due": "{hint} Hazlo aproximadamente cada {months} meses.",
  "care.routine.done_on": "{hint} Lo hiciste el {date}: por ahora no hay nada que hacer.",
  "care.routine.done_recently": "{hint} Lo hiciste hace poco: por ahora no hay nada que hacer.",
  "care.btn.update": "Actualizar esto",
  "care.btn.did_it": "Ya lo hice",
  "care.btn.did_again": "Lo hice de nuevo",
  "care.btn.get_help": "Buscar ayuda",
  "care.btn.show_less": "Ver menos",
  "care.btn.see_all": "Ver todo ({count})",
  "care.toast.logged": "Registrado: eso sube tu Puntaje del Hogar",
  "care.toast.error": "No pudimos guardar eso",

  "care.system.roof": "Techo",
  "care.system.hvac": "Sistema de climatización",
  "care.system.water_heater": "Calentador de agua",
  "care.system.windows": "Ventanas",
  "care.system.electrical": "Panel eléctrico",
  "care.system.siding": "Revestimiento/pintura exterior",

  "care.seasonal.hvac_filter.label": "Cambiar el filtro de climatización",
  "care.seasonal.hvac_filter.hint":
    "Mantiene un buen flujo de aire y reduce el esfuerzo del sistema.",
  "care.seasonal.gutters.label": "Limpiar canaletas y bajantes",
  "care.seasonal.gutters.hint":
    "Evita desbordes que dañan los bordes del techo y los cimientos.",
  "care.seasonal.water_heater_flush.label": "Purgar el calentador de agua",
  "care.seasonal.water_heater_flush.hint":
    "Elimina el sedimento para que el tanque dure más tiempo.",
  "care.seasonal.dryer_vent.label": "Limpiar el ducto de la secadora",
  "care.seasonal.dryer_vent.hint":
    "Un ducto tapado es un riesgo de incendio común y evitable.",
  "care.seasonal.smoke_detectors.label": "Probar detectores de humo y CO",
  "care.seasonal.smoke_detectors.hint":
    "Cambia las baterías y confirma que todas las alarmas suenen.",
  "care.seasonal.exterior_caulk.label": "Revisar sellos y masilla exterior",
  "care.seasonal.exterior_caulk.hint":
    "Sellar huecos alrededor de ventanas y puertas reduce la pérdida de energía.",

  // ------------------------------------------------ siguiente paso sugerido
  "next.eyebrow": "Tu siguiente paso sugerido",
  "next.overdue": "{label} lleva {years} año(s) más de su vida útil esperada",
  "next.soon": "{label} se acerca al final de su vida útil (~{years} año(s))",
  "next.btn.how": "Cómo manejar esto",
  "next.btn.quotes": "Pedir cotizaciones",
  "next.btn.done": "Ya está hecho: agregar detalles",
  "next.pro.founding": "Socio fundador",
  "next.pro.reviews": "{count} reseñas",
  "next.pro.request": "Solicitar este profesional",
  "next.dialog.title": "{label}: qué hacer",
  "next.dialog.steps": "Pasos",
  "next.dialog.diy": "Hazlo tú mismo vs. profesional:",
  "next.dialog.cost": "Costo típico:",
  "next.dialog.cta": "Pide cotizaciones a un profesional de SuCasa",
  "next.dialog.disclaimer":
    "Las estimaciones son una guía general basada en la vida útil estándar de los componentes; la inspección de tu profesional tiene la última palabra.",

  "guide.fallback.what":
    "Se proyecta que {label} llegue al final de su vida útil alrededor de {year}.",
  "guide.fallback.step1":
    "Confirma la fecha de instalación en la etiqueta del equipo o en tus registros.",
  "guide.fallback.step2": "Busca desgaste visible, fugas o cambios en el rendimiento.",
  "guide.fallback.step3":
    "Consigue dos cotizaciones por escrito para comparar alcance y precio.",
  "guide.fallback.diy": "Revisa a simple vista; deja las reparaciones a un profesional con licencia.",
  "guide.fallback.cost": "Pide a cada profesional un estimado detallado por partidas.",

  "guide.roof.what":
    "Un techo que llegó al final de su vida útil puede dejar entrar agua mucho antes de que veas una mancha en el cielo raso.",
  "guide.roof.step1":
    "Recorre el perímetro y busca tejas dobladas, agrietadas o faltantes.",
  "guide.roof.step2":
    "Revisa las canaletas en busca de gránulos de teja: señal de que la superficie se está gastando.",
  "guide.roof.step3":
    "Después de la lluvia revisa el ático por humedad o entrada de luz por el techo.",
  "guide.roof.step4":
    "Contrata a un techador con licencia para una inspección escrita con fotos antes de decidir entre reparar o reemplazar.",
  "guide.roof.diy":
    "Las revisiones visuales desde el suelo están bien. Nunca camines sobre el techo.",
  "guide.roof.cost":
    "Las inspecciones suelen ser gratis o de $150 a $400; las reparaciones varían mucho según la pendiente y el material.",

  "guide.hvac.what":
    "Los sistemas con más de 15 años pierden eficiencia, funcionan más tiempo y fallan con más frecuencia en temporada alta.",
  "guide.hvac.step1":
    "Cambia el filtro de aire y anota el año del modelo en la etiqueta de la unidad exterior.",
  "guide.hvac.step2": "Escucha si se enciende y apaga seguido, arranca con dificultad o hace ruidos nuevos.",
  "guide.hvac.step3":
    "Compara las facturas de verano e invierno año con año: un salto suele indicar pérdida de eficiencia.",
  "guide.hvac.step4":
    "Agenda un mantenimiento y pide un estimado de reparar vs. reemplazar con números de eficiencia.",
  "guide.hvac.diy":
    "Cambiar filtros y despejar la basura alrededor de la unidad exterior te toca a ti.",
  "guide.hvac.cost":
    "El mantenimiento suele costar de $90 a $200; siempre compara las cotizaciones de reemplazo entre profesionales.",

  "guide.water_heater.what":
    "Los calentadores de tanque duran unos 10 años. La mayoría falla por fugas, que pueden inundar un espacio terminado.",
  "guide.water_heater.step1":
    "Busca el número de serie en la etiqueta del tanque para confirmar su edad.",
  "guide.water_heater.step2":
    "Busca óxido en la base, humedad en la bandeja o agua caliente descolorida.",
  "guide.water_heater.step3":
    "Purga el sedimento una vez al año si el fabricante lo permite.",
  "guide.water_heater.step4":
    "Pide una cotización de un tanque igual y de una opción sin tanque para comparar.",
  "guide.water_heater.diy":
    "Purgarlo es posible; cualquier trabajo de gas o ventilación debe hacerlo un plomero con licencia.",
  "guide.water_heater.cost":
    "El servicio de purga cuesta de $100 a $200; el reemplazo suele ser de $1,200 a $3,500 instalado.",

  "guide.windows.what":
    "Los sellos vencidos y los marcos viejos suben la factura de energía y dejan entrar humedad a la pared.",
  "guide.windows.step1":
    "Busca empañamiento entre los vidrios: eso significa que el sello falló.",
  "guide.windows.step2": "Siente si hay corrientes de aire en los marcos en un día frío o con viento.",
  "guide.windows.step3": "Anota qué habitaciones cuesta más mantener cómodas.",
  "guide.windows.step4":
    "Pide a un profesional que cotice el reemplazo completo frente a la reparación del sello solo en las peores ventanas.",
  "guide.windows.diy":
    "Volver a sellar y colocar burletes son mejoras fáciles antes de cualquier reemplazo.",
  "guide.windows.cost":
    "Masilla y burletes por menos de $60; los reemplazos van de $450 a $1,200 por ventana.",

  "guide.electrical.what":
    "Los paneles viejos pueden quedar cortos para las cargas de hoy, y algunas marcas son un riesgo de incendio conocido.",
  "guide.electrical.step1": "Fotografía la etiqueta del panel: marca, amperaje y año.",
  "guide.electrical.step2":
    "Anota los interruptores que se botan seguido, tapas calientes u olor a quemado (llama de inmediato).",
  "guide.electrical.step3":
    "Haz una lista de lo que planeas agregar: cargador de auto eléctrico, bomba de calor, jacuzzi, ADU.",
  "guide.electrical.step4":
    "Contrata a un electricista con licencia para evaluar el panel y calcular la carga.",
  "guide.electrical.diy": "Ninguno. Nunca abras ni trabajes dentro del panel.",
  "guide.electrical.cost":
    "Las evaluaciones cuestan de $100 a $250; mejorar el panel suele costar de $1,800 a $4,500.",

  "guide.siding.what":
    "La pintura y el revestimiento son la barrera contra el clima: cuando fallan, las reparaciones se vuelven estructurales.",
  "guide.siding.step1":
    "Busca pintura descascarada, molduras blandas, huecos en las uniones y masilla despegada.",
  "guide.siding.step2":
    "Presiona las molduras sospechosas con un destornillador; si están blandas, hay pudrición.",
  "guide.siding.step3": "Prioriza primero los lados que reciben más sol y lluvia.",
  "guide.siding.step4":
    "Pide cotizaciones que separen la carpintería de la pintura para poder hacer el trabajo por etapas.",
  "guide.siding.diy":
    "Lavar y sellar puntos es fácil de hacer; el trabajo en escalera no lo es.",
  "guide.siding.cost":
    "Las reparaciones puntuales cuestan unos cientos de dólares; pintar todo el exterior, de $4,000 a $12,000.",

  // -------------------------------------------------------------- documentos
  "docs.hero.eyebrow": "Documentos",
  "docs.hero.title": "Documentos",
  "docs.hero.subtitle": "Los papeles de tu casa, guardados en un solo lugar.",
  "docs.status.uploading": "Subiendo…",
  "docs.status.empty":
    "Todavía no hay nada guardado. Empieza con tu informe de inspección: lo leemos por ti.",
  "docs.status.analyzing": "Estamos leyendo tu informe de inspección. Dale un minuto.",
  "docs.status.no_inspection_one":
    "Guardamos 1 archivo para ti. Agrega tu informe de inspección: ese es el más útil.",
  "docs.status.no_inspection_many":
    "Guardamos {count} archivos para ti. Agrega tu informe de inspección: ese es el más útil.",
  "docs.status.ok_one":
    "Guardamos 1 archivo a salvo y lo usamos para armar tu lista de tareas.",
  "docs.status.ok_many":
    "Guardamos {count} archivos a salvo y los usamos para armar tu lista de tareas.",
  "docs.action.add": "Agregar un documento",
  "docs.action.add_inspection": "Agregar tu informe de inspección",
  "docs.connect.note":
    "Todo lo que agregues aquí nos ayuda a decirte qué necesita realmente tu casa.",
  "docs.connect.label": "Ver qué hay que hacer",
  "docs.uploading_what": "¿Qué vas a subir?",
  "docs.type_aria": "Tipo de documento",
  "docs.choose_file": "Elegir archivo",
  "docs.kind.inspection": "Informe de inspección",
  "docs.kind.insurance": "Póliza de seguro",
  "docs.kind.warranty": "Garantía",
  "docs.kind.deed": "Escritura",
  "docs.kind.other": "Otro",
  "docs.kind.other_label": "Documento",
  "docs.help.inspection":
    "La mejor primera subida: lo leemos y lo convertimos en una lista de condición y recomendaciones de servicio.",
  "docs.help.insurance":
    "Nos permite señalar huecos de cobertura y recordarte antes de la renovación.",
  "docs.help.warranty": "Para que nunca pagues una reparación que todavía está cubierta.",
  "docs.help.deed":
    "Confirma los datos de propiedad detrás de tus cifras de valor y plusvalía.",
  "docs.help.other": "Cualquier otra cosa que valga la pena guardar con el historial de tu casa.",
  "docs.empty.title": "Todavía no hay documentos",
  "docs.empty.body":
    "Tu informe de inspección es la victoria más rápida: lo leemos y te decimos qué necesita tu casa, en orden.",
  "docs.empty.cta": "Subir informe de inspección",
  "docs.badge.reading": "Leyendo…",
  "docs.badge.analyzed": "Analizado",
  "docs.badge.failed": "No se pudo leer",
  "docs.aria.view": "Ver",
  "docs.aria.delete": "Eliminar",
  "docs.toast.removed": "Documento eliminado",
  "docs.toast.uploaded": "Documento subido",
  "docs.toast.reading": "Leyendo tu informe de inspección…",
  "docs.toast.found_one": "Encontramos 1 cosa que vale la pena saber sobre tu casa",
  "docs.toast.found_many": "Encontramos {count} cosas que vale la pena saber sobre tu casa",
  "docs.toast.read_failed": "No pudimos leer ese informe: {message}",
  "docs.err.not_signed_in": "No has iniciado sesión",

  // ------------------------------------------------------ valor y plusvalía
  "money.loading": "Cargando plusvalía e hipoteca…",
  "money.title": "Plusvalía e hipoteca",
  "money.basis.waiting": "Esperando un valor para tu casa.",
  "money.basis.assessed":
    "Basado en el valor de mercado del tasador ({amount}): no hay estimación automática registrada para esta dirección.",
  "money.basis.avm": "Basado en una estimación automática de {amount}.",
  "money.refi.signal": "Señal de refinanciamiento",
  "money.refi.strong": "fuerte",
  "money.refi.moderate": "moderada",
  "money.refi.watch": "en observación",
  "money.refi.savings": "Podrías ahorrar ~{amount}/mes · Ver opciones",
  "money.refi.see_options": "Ver tus opciones de crédito",
  "money.needs_value":
    "La plusvalía y el margen de efectivo necesitan un valor para calcularse.",
  "money.retry": "Reintentar",
  "money.stat.equity": "Plusvalía estimada",
  "money.stat.equity_pct_assessed": "{pct} del valor tasado",
  "money.stat.equity_pct": "{pct} del valor",
  "money.stat.no_valuation": "Sin tasación registrada",
  "money.stat.cash_out": "Margen de efectivo",
  "money.stat.needs_valuation": "Necesita una tasación",
  "money.stat.ltv_assessed": "Al 80% de LTV · valor tasado",
  "money.stat.ltv": "Al 80% de LTV",
  "money.stat.loan": "Saldo del préstamo (est.)",
  "money.stat.no_mortgage": "Ninguno registrado",
  "money.stat.no_mortgage_detail": "No hay hipoteca abierta en los registros públicos",
  "money.stat.rate_lender": "{rate}% · {lender}",
  "money.stat.lender_word": "prestamista",
  "money.stat.permits": "Permisos registrados",
  "money.stat.permit_last": "Último {date}",
  "money.stat.permit_recorded": "Registrado",
  "money.stat.owned_no_permits": "En propiedad ~{years} años · ninguno registrado",
  "money.stat.none_on_record": "Ninguno registrado",
  "money.permits.note":
    "No se encontraron permisos en los registros públicos de esta dirección. La cobertura de permisos varía según la jurisdicción, así que pueden existir permisos locales sin aparecer aquí.",
  "value.status.no_coverage":
    "Todavía no hay una tasación en el registro público para esta dirección.",
  "value.status.incomplete_address":
    "Completa tu dirección (ciudad, estado y código postal) para poder encontrar tus registros de propiedad.",
  "value.status.no_address": "Agrega la dirección de tu casa para ver el valor y la plusvalía.",
  "value.status.budget_capped":
    "Esperando los registros de propiedad: por ahora mostramos datos guardados.",
  "value.status.resolved": "",

  // -------------------------------------------------------------- asistente
  "assistant.title": "Asistente del Hogar",
  "assistant.beta": "Beta",
  "assistant.ask_anything": "Pregunta lo que quieras sobre tu casa",
  "assistant.example": "«¿Cuándo debo darle mantenimiento a la climatización?»",
  "assistant.suggestion.hvac": "¿Cuándo debo darle mantenimiento a la climatización?",
  "assistant.suggestion.findings": "¿Qué significan los hallazgos de mi inspección?",
  "assistant.suggestion.refi": "¿Soy buen candidato para refinanciar?",
  "assistant.thinking": "Pensando…",
  "assistant.placeholder": "Pregunta sobre tu casa…",
  "assistant.error": "Algo salió mal.",
};
