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
    expect(wrapper.findAll(".mail__mark").map((mark) => mark.attributes("style"))).toEqual([
      "--mark: 0.8;",
      "--mark: 0.9;"
    ]);
    expect(rows(wrapper)).toEqual([
      "200 Sign-up codes stop",
      "200 The API logs a warning",
      "225 Password reset codes stop",
      "250 All mail stops"
    ]);
    expect(wrapper.find(".mail__here").exists()).toBe(true);
    expect(wrapper.findAll(".mail__scale span").map((part) => part.text())).toEqual([
      "188 until sign-up codes stop",
      "238 left"
    ]);
    expect(wrapper.findComponent(StatusMessage).exists()).toBe(false);
    expect(wrapper.find(".mail__note").text()).toMatch(
      /^Counted by the API since midnight UTC or its last restart, whichever is later\. It starts again from 0 at midnight UTC, .+ your time\. Mail sent before a restart isn't counted, so the mail provider's own count can be higher\.$/
    );
    expect(wrapper.find(".mail__note time").attributes("datetime")).toBe(
      "2026-11-07T00:00:00.000Z"
    );
  });

  it("shows no run before the day's first mail", () => {
    const wrapper = mountMeter(aMailBudget({ sentToday: 0 }));

    expect(wrapper.find(".mail__line").classes()).not.toContain("mail__line--some");
  });

  it("says when sign-up codes have stopped for the day, and how long password reset codes go on", () => {
    const wrapper = mountMeter(aMailBudget({ sentToday: 202 }));

    // 202 is 0.808 along: the here ring covers the ring at 200, not the one at 225.
    const marks = wrapper.findAll(".mail__mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].attributes("style")).toContain("--mark: 0.9");
    expect(marks[0].classes()).not.toContain("mail__mark--reached");
    expect(wrapper.findAll(".mail__scale span").map((part) => part.text())).toEqual([
      "23 until password reset codes stop",
      "48 left"
    ]);
    expect(rows(wrapper)).toEqual([
      "200 Sign-up codes stop Reached",
      "200 The API logs a warning Reached",
      "225 Password reset codes stop",
      "250 All mail stops"
    ]);
    const notice = wrapper.findComponent(StatusMessage);
    expect(notice.props("tone")).toBe("info");
    expect(notice.text()).toBe(
      "Sign-up codes have stopped until midnight UTC or the API's next restart. Password reset codes still go out up to 225, other mail to existing accounts up to 250."
    );
  });

  it("says when password reset codes have stopped too", () => {
    const wrapper = mountMeter(aMailBudget({ sentToday: 230 }));

    // 230 is 0.92 along: the here ring covers the ring at 225, and the one at 200 is passed.
    const marks = wrapper.findAll(".mail__mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].attributes("style")).toContain("--mark: 0.8");
    expect(marks[0].classes()).toContain("mail__mark--reached");
    expect(wrapper.findAll(".mail__scale span").map((part) => part.text())).toEqual([
      "",
      "20 left"
    ]);
    expect(rows(wrapper)).toEqual([
      "200 Sign-up codes stop Reached",
      "200 The API logs a warning Reached",
      "225 Password reset codes stop Reached",
      "250 All mail stops"
    ]);
    const notice = wrapper.findComponent(StatusMessage);
    expect(notice.props("tone")).toBe("info");
    expect(notice.text()).toBe(
      "Sign-up and password reset codes have stopped until midnight UTC or the API's next restart. E-mail change codes and notices still go out, up to 250."
    );
  });

  it("turns a passed stop's ring route green once the here ring has left it", () => {
    const wrapper = mountMeter(aMailBudget({ sentToday: 248 }));

    expect(wrapper.findAll(".mail__mark").map((mark) => mark.classes())).toEqual([
      ["mail__mark", "mail__mark--reached"],
      ["mail__mark", "mail__mark--reached"]
    ]);
  });

  it("writes a large limit with the reader's digit grouping", () => {
    const wrapper = mountMeter(
      aMailBudget({
        sentToday: 8100,
        dailyLimit: 10000,
        warningAt: 8000,
        registrationStopsAt: 8000,
        passwordResetStopsAt: 9000
      })
    );

    expect(wrapper.find(".mail__figure").text()).toBe(
      `${(8100).toLocaleString()} of ${(10000).toLocaleString()} sent`
    );
    expect(wrapper.find(".mail__scale span").text()).toBe(
      `${(900).toLocaleString()} until password reset codes stop`
    );
    expect(wrapper.findComponent(StatusMessage).text()).toContain(
      `up to ${(9000).toLocaleString()}, other mail to existing accounts up to ${(10000).toLocaleString()}.`
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
      /^Today's mail limit is used up: no mail goes out until midnight UTC \(.+ your time\) or the API's next restart\.$/
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
