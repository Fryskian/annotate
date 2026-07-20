(function () {
  "use strict";

  var settings = window.AnnotateReviewTour || {};
  var practice = settings.mode === "practice";

  try {
    if (practice && settings.reviewer && !localStorage.getItem("an-author")) localStorage.setItem("an-author", settings.reviewer);
  } catch (error) {}

  if (practice) {
    window.AnnotateConfig = Object.assign({}, window.AnnotateConfig || {}, {
      project: "forcys-annotate-welcome",
      page: "/wordpress-tour",
      startOpen: true,
      accent: "#6d28d9",
      blocks: "[data-review-block]",
      note: "Dit is een oefenpagina. Probeer gerust alle gereedschappen uit.",
      submitReview: function (review) {
        window.__forcysDemoSubmission = review;
        var status = document.getElementById("forcys-tour-status");
        if (status) status.textContent = "Testreview ontvangen — er is niets verzonden.";
        return Promise.resolve({ id: "demo" });
      },
    });
  }

  function element(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") node.textContent = attrs[key];
      else if (key === "class") node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function init() {
    if (!window.Annotate || document.getElementById("forcys-tour")) return;

    var start = element("button", { type: "button", class: "fc-guide-button fc-guide-button-primary", text: "Start de rondleiding", autofocus: "" });
    var skip = element("button", { type: "button", class: "fc-guide-button", text: "Nu overslaan" });
    var welcome = element("dialog", { id: "forcys-welcome", "aria-labelledby": "forcys-welcome-title", "data-annotate-ui": "" }, [
      element("div", { class: "fc-welcome-body" }, [
        element("p", { class: "fc-kicker", text: "Korte uitleg" }),
        element("h2", { id: "forcys-welcome-title", text: "Welkom bij Forcys Annotate" }),
        element("p", { text: "In een paar minuten leer je feedback direct op een webpagina te zetten." }),
        element("ul", {}, [
          element("li", { text: "Kies precies het juiste onderdeel." }),
          element("li", { text: "Markeer, teken of plaats een pin." }),
          element("li", { text: practice ? "Probeer veilig indienen zonder iets te versturen." : "Controleer je opmerkingen voordat je ze indient." }),
        ]),
        element("div", { class: "fc-actions" }, [skip, start]),
      ]),
    ]);

    var progress = element("span", { id: "forcys-tour-progress" });
    var close = element("button", { id: "forcys-tour-close", type: "button", "aria-label": "Rondleiding sluiten", text: "×" });
    var title = element("h2", { id: "forcys-tour-title" });
    var copy = element("p", { id: "forcys-tour-copy" });
    var status = element("p", { id: "forcys-tour-status", role: "status" });
    var back = element("button", { type: "button", class: "fc-guide-button", text: "Vorige" });
    var next = element("button", { type: "button", class: "fc-guide-button fc-guide-button-primary", text: "Volgende" });
    var tour = element("aside", { id: "forcys-tour", "aria-labelledby": title.id, "aria-live": "polite", "data-annotate-ui": "", hidden: "" }, [
      element("div", { class: "fc-tour-top" }, [progress, close]), title, copy, status,
      element("div", { class: "fc-tour-actions" }, [back, next]),
    ]);
    document.body.appendChild(welcome);
    document.body.appendChild(tour);

    var steps = [
      { tool: "cursor", title: "Rustig rondkijken", copy: "Met de pijl navigeer je gewoon door de pagina zonder een nieuwe opmerking te maken." },
      { tool: "inspect", title: "Kies precies het juiste element", copy: "Beweeg over de pagina, klik een onderdeel en kies zo nodig een bovenliggend element via het kruimelpad." },
      { tool: "highlight", title: "Markeer tekst", copy: "Selecteer woorden of zinnen. Daarna voeg je meteen je uitleg toe." },
      { tool: "rect", title: "Teken een rechthoek", copy: "Sleep een kader rond een gebied dat aangepast of gecontroleerd moet worden." },
      { tool: "circle", title: "Teken een cirkel", copy: "Omcirkel een detail om snel duidelijk te maken waar je naar verwijst." },
      { tool: "pen", title: "Teken uit de vrije hand", copy: "Teken vrij op de pagina. Houd Ctrl of ⌘ ingedrukt bij loslaten om meerdere lijnen te combineren." },
      { tool: "pin", title: "Plaats een pin", copy: practice ? "Klik op de oefenkaart ‘Nieuwe hero-afbeelding’, schrijf een testopmerking en sla die op." : "Klik ergens op de pagina, schrijf je opmerking en sla die op." },
      { tool: "cursor", title: "Kies een kleur", copy: "Met de kleurknop geef je tekeningen en pins een herkenbare kleur.", selector: "#__an_colorbtn" },
      { tool: "cursor", title: "Voeg snel een sectie-opmerking toe", copy: "Beweeg over een inhoudsblok. Met de plus aan de rand voeg je zonder tekenen een opmerking over de hele sectie toe.", selector: practice ? "[data-review-block]" : false },
      { title: practice ? "Controleer en dien je testreview in" : "Controleer en dien je review in", copy: practice ? "Open het overzicht en klik op ‘Submit review’. Deze oefenpagina verstuurt niets." : "Open het overzicht, controleer je opmerkingen en klik op ‘Submit review’ wanneer je klaar bent.", selector: "#__an_foot .an-submit" },
    ];
    var step = 0;
    var target;
    var returnFocus;

    function clearTarget() {
      if (target) target.classList.remove("forcys-tour-target");
      target = null;
    }
    function showStep(index) {
      step = Math.max(0, Math.min(index, steps.length - 1));
      var item = steps[step];
      clearTarget();
      status.textContent = "";
      if (item.tool) window.Annotate.setTool(item.tool);
      else window.Annotate.open();
      title.textContent = item.title;
      copy.textContent = item.copy;
      progress.textContent = "Stap " + (step + 1) + " van " + steps.length;
      tour.classList.toggle("fc-tour-final", step === steps.length - 1);
      back.hidden = step === 0;
      next.hidden = step === steps.length - 1;
      var selector = item.selector === false ? "" : (item.selector || '[data-tool="' + item.tool + '"]');
      target = selector && document.querySelector(selector);
      if (target) target.classList.add("forcys-tour-target");
      tour.hidden = false;
    }
    function closeTour() {
      clearTarget();
      tour.hidden = true;
      window.Annotate.setTool("cursor");
      if (returnFocus) returnFocus.focus();
    }
    function openWelcome(source) {
      returnFocus = source;
      welcome.showModal();
    }
    function startTour() {
      welcome.close();
      showStep(0);
      next.focus();
    }

    start.addEventListener("click", startTour);
    skip.addEventListener("click", function () { welcome.close(); if (returnFocus) returnFocus.focus(); });
    close.addEventListener("click", closeTour);
    next.addEventListener("click", function () { showStep(step + 1); });
    back.addEventListener("click", function () { showStep(step - 1); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !tour.hidden && !welcome.open) closeTour();
    });

    var restart = document.getElementById("forcys-restart");
    if (restart) restart.addEventListener("click", function () { openWelcome(restart); });
    if (!practice) {
      var help = element("button", { id: "forcys-tour-help", type: "button", class: "an-btn", title: "Rondleiding", "aria-label": "Rondleiding", "data-tip": "Rondleiding", "data-annotate-ui": "", text: "?" });
      document.getElementById("__an_bar").appendChild(help);
      help.addEventListener("click", function () { openWelcome(help); });
    }
    if (settings.autostart) openWelcome(restart);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
