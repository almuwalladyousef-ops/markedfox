import { Pane } from "./pane";

// Settings used to redirect straight to Connected accounts, on the reasoning
// that an empty pane beside a full menu is a wasted click. That holds on a
// desktop and breaks on a phone, where the menu IS the screen and had nowhere
// to be — the back link from a pane needs somewhere to go back TO.
//
// So the index exists, and on a phone it is the menu (SettingsPanes hides this
// pane below `wide`). Above the breakpoint the menu is already on the left and
// this is what sits beside it, which is why it says something rather than
// nothing.
export default function SettingsIndex() {
  return (
    <Pane
      title="Settings"
      blurb="Your account, the platforms you have connected, your plan, and what MarkedFox is allowed to do with your data. Pick a section on the left."
    >
      <></>
    </Pane>
  );
}
