import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MailBudgetMeter from "@/components/features/admin/MailBudgetMeter.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import type { MailBudgetResponse } from "@/types/api/admin";
import { aMailBudget } from "@/__tests__/helpers/admin";

const mountMeter = (budget: MailBudgetResponse = aMailBudget()) =>
  mount(MailBudgetMeter, { props: { budget } });

const rows = (wrapper: ReturnType<typeof mountMeter>) =>
  wrapper.findAll(".stops__row").map((row) => row.text().replace(/\s+/g, " "));

describe("MailBudgetMeter", () => {
  it("draws today's mail as a meter, with its stops in words", () => {
    const wrapper = mountMeter();

    expect(wrapper.find(".mail__figure").text()).toBe("12 of 250 sent");
    expect(wrapper.find("[role=meter]").attributes()).toMatchObject({
      "aria-label": "Mail sent today",
      "aria-valuemin": "0",
      "aria-valuemax": "250",
      "aria-valuenow": "12",
      "aria-valuetext": "12 of 250 sent"
    });
    expect(wrapper.find("[role=meter]").attributes("style")).toContain("--share: 0.048");
    expect(wrapper.find(".mail__line").classes()).toContain("mail__line--some");
    // The warning and the sign-up stop share one ring on the line, but each has its own row.
    expect(wrapper.findAll(".mail__mark")).toHaveLength(1);
    expect(wrapper.find(".mail__mark").attributes("style")).toContain("--mark: 0.8");
    expect(rows(wrapper)).toEqual([
      "200 Sign-up codes stop",
      "200 The API logs a warning",
      "250 All mail stops"
    ]);
    expect(wrapper.find(".mail__here").exists()).toBe(true);
    expect(wrapper.findAll(".mail__scale span").map((part) => part.text())).toEqual([
      "188 until sign-up codes stop",
      "238 left"
    ]);
    expect(wrapper.findComponent(StatusMessage).exists()).toBe(false);
    expect(wrapper.find(".mail__note").text()).toMatch(
      /^Counted by the API since midnight UTC or its last restart, whichever is later\. It starts again from 0 at midnight UTC, .+ your time\.$/
    );
    expect(wrapper.find(".mail__note time").attributes("datetime")).toBe(
      "2026-11-07T00:00:00.000Z"
    );
  });

  it("shows no run before the day's first mail", () => {
    const wrapper = mountMeter(aMailBudget({ sentToday: 0 }));

    expect(wrapper.find(".mail__line").classes()).not.toContain("mail__line--some");
  });

  it("says when sign-up codes have stopped for the day", () => {
    const wrapper = mountMeter(aMailBudget({ sentToday: 230 }));

    expect(wrapper.find(".mail__mark").classes()).toContain("mail__mark--reached");
    expect(wrapper.findAll(".mail__scale span").map((part) => part.text())).toEqual([
      "",
      "20 left"
    ]);
    expect(rows(wrapper)).toEqual([
      "200 Sign-up codes stop Reached",
      "200 The API logs a warning Reached",
      "250 All mail stops"
    ]);
    const notice = wrapper.findComponent(StatusMessage);
    expect(notice.props("tone")).toBe("info");
    expect(notice.text()).toBe(
      "Sign-up codes have stopped for today. Mail to existing accounts still goes out, up to 250."
    );
  });

  it("turns Fault Red at the limit, and says when mail goes out again", () => {
    const wrapper = mountMeter(aMailBudget({ sentToday: 250 }));

    expect(wrapper.find(".mail").classes()).toContain("mail--full");
    expect(wrapper.find(".mail__here").exists()).toBe(false);
    expect(wrapper.find("[role=meter]").attributes("aria-valuenow")).toBe("250");
    expect(rows(wrapper).at(-1)).toBe("250 All mail stops Reached");
    const notice = wrapper.findComponent(StatusMessage);
    expect(notice.props("tone")).toBe("error");
    expect(notice.text()).toMatch(
      /^Today's mail limit is used up: no mail goes out until midnight UTC \(.+ your time\)\.$/
    );
    expect(wrapper.find(".mail__scale").text()).toBe("0 left");
  });

  it("keeps the meter's value within the limit", () => {
    const wrapper = mountMeter(aMailBudget({ sentToday: 260 }));

    expect(wrapper.find("[role=meter]").attributes()).toMatchObject({
      "aria-valuenow": "250",
      "aria-valuetext": "260 of 250 sent"
    });
  });
});
