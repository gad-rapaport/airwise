# Animation storyboard

20 s at 30 fps.

| Time | Scene | Visual content | Motion | Text | Capability shown |
| --- | --- | --- | --- | --- | --- |
| 0.0-1.4 | City | Skyline of outlined towers, sun, haze dots | Towers grow from the ground with random delays (`outCubic`); haze drifts | | |
| 0.7-4.0 | City | Runner holding a phone showing the Airwise mobile screen | Idle; haze keeps drifting | Run now, or wait for cleaner air? | The need |
| 4.0-4.8 | Push in | The phone rectangle grows into a navy frame | Size and position interpolate (`inOutCubic`) | | |
| 4.9-5.9 | Data space | Ten city nodes in a column; spokes draw to one hub marked "1" | Nodes pop (`outBack`, 0.06 s stagger); spokes draw on | Ten cities, one request, checked before storing. | One request |
| 6.0-6.8 | Data space | Thick link to the Open-Meteo node; a pulse travels out | Link draws on; pulse eases along the path | (same) | Provider call |
| 6.8-8.4 | Data space | Response packets travel back through a shield-shaped schema check; one red packet bounces off | Packets staggered 0.07 s, spin; rejected packet arcs away and fades | (same) | Validation |
| 7.6-9.3 | Data space | Packets drop into three stacked sheets labelled "stored locally" | Sheets separate with overshoot | (same) | SQLite store |
| 9.4-10.1 | Chart | Chart panel rises out of the layers | Rise and scale (`outCubic`) | Real data, compared against the WHO line. | |
| 10.0-11.8 | Chart | Four PM2.5 lines from the snapshot draw left to right; legend with marker shapes | Dashoffset (`inOutCubic`), 0.2 s stagger | (same) | Comparison |
| 11.2-12.4 | Chart | Forecast area shades; WHO 15 µg/m³ dashed line extends | Fades; line grows | (same) | Forecast, guideline |
| 12.9-13.6 | Outage | Provider node top right with a short link; link turns red and a cross appears | Link draws, cross pops | Provider down? Saved data stays, clearly labelled. | Failure handling |
| 13.6-15.4 | Outage | Amber "Saved data" banner below the chart; chart unchanged | Banner rises with overshoot | (same) | Stale data shown |
| 15.4-16.1 | Pull out | Navy frame shrinks back into the hand | Reverse of the push in | | |
| 16.0-17.8 | City | Haze fades, sun warms; card "Tel Aviv-Yafo 37 EAQI · Fair"; runner runs off | Run cycle, card pops | Fair air. Good to go. | Outcome |
| 17.8-20.0 | End | Teal mark, Airwise, tagline, repository, data credit | Mark rotates in; text staggered | Airwise ... | Brand |
