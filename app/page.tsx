import { redirect } from "next/navigation";

export default function RootPage() {
  // វានឹងរុញអ្នកប្រើប្រាស់ទៅកាន់ទំព័រ /home ដោយស្វ័យប្រវត្តិ
  redirect("/home");
}