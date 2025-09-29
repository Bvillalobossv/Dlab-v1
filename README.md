# SenseWell · Medidor de Ruido + Escaneo corporal (Web)

Web app que activa el **micrófono** del dispositivo, estima el nivel de sonido en **dB (aprox.)**, lo **clasifica** en estados emocionales y ahora incorpora un **Escaneo corporal** con encuesta laboral y body-scan por zonas. Además, genera un **indicador combinado** (dB + tensión corporal).

> ⚠️ Importante: Los navegadores trabajan en **dBFS** (relativo al máximo digital). Para acercarte a **dB SPL** reales, ajusta la **calibración (dB)** con una referencia conocida (app SPL calibrada o medidor físico).

## Flujo
- **Ruido ambiental**: Medición 5s → promedio dB → etiqueta emocional → histórico (Chart.js).
- **Escaneo corporal**:
  1. Introducción y privacidad
  2. Encuesta laboral (fecha/hora, área, horas, sliders 1–10)
  3. **Body-scan** con zonas clicables (tensión 1–10 por zona) + síntomas
  4. Resumen final (promedios, gráfico)
- **Integración**: Índice combinado (40% dB, 60% tensión corporal) con interpretación y recomendaciones.

## Demo local
```bash
git clone https://github.com/<tu-usuario>/sensewell-sound-meter.git
cd sensewell-sound-meter
# abre index.html con Live Server o un servidor estático con HTTPS para acceso al micrófono
