import { initialiseLanguage } from "./i18n";
import { installValidationMessages } from "./i18n/validation";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installDemoMock } from "./demo";
import "./styles/globals.css";

async function bootstrap() {
  initialiseLanguage();
  installValidationMessages();
  await installDemoMock();
  ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
    React.createElement(React.StrictMode, null, React.createElement(App))
  );
}

void bootstrap();
