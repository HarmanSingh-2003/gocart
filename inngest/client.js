import { Inngest } from "inngest";

export const inngest = new Inngest({ 
  id: "gocart-ecommerce",
  isDev: process.env.NODE_ENV === "development",
});