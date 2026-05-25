import Icon from "@/components/ui/Icon";

export const metadata = {
  title: "About Us | PTEC e-Library",
  description: "Learn about Phnom Penh Teacher Education College (PTEC) - Leading institution for teacher education in Cambodia.",
};

export default function AboutPage() {
  return (
    <div className="bg-slate-50 px-6 py-14 md:px-12 min-h-screen">
      <div className="mx-auto max-w-[1000px]">
        
        {/* Page Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-slate-950 md:text-5xl drop-shadow-sm mb-4">
            About <span className="text-[#007c91]">PTEC</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            A leading institution in Cambodia dedicated to training competent teachers and advancing the quality of education nationwide.
          </p>
        </div>

        {/* Background & History */}
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm md:p-12 mb-10">
          <h2 className="mb-6 text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Icon name="school" className="text-[28px] text-[#007c91]" />
            Background & History
          </h2>
          <div className="space-y-4 text-[15px] leading-relaxed text-slate-600">
            <p>
              The <strong>Phnom Penh Teacher Education College (PTEC)</strong> was officially established by Sub-decree No. 73 on May 22, 2017, through the merger of the Phnom Penh Regional Teacher Training Center and the Phnom Penh Municipality Teacher Training Center.
            </p>
            <p>
              PTEC is committed to preparing highly competent, innovative, and professional teachers through the <strong>12+4 program</strong> (12 years of general education + 4 years of higher education). The college plays a crucial role in developing the skilled teaching workforce needed for Cambodia’s national development.
            </p>
          </div>
        </div>

        {/* Vision & Mission */}
        <div className="grid gap-8 md:grid-cols-2 mb-10">
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Icon name="globe" className="text-[28px] text-[#007c91]" />
              Vision
            </h2>
            <p className="text-slate-600 leading-relaxed">
              To be a leading institution of teacher education in the 21st century.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Icon name="bookmark" className="text-[28px] text-[#007c91]" />
              Mission
            </h2>
            <ul className="space-y-3 text-slate-600">
              <li className="flex gap-2">
                <span className="text-[#007c91] font-bold">M1.</span> Educate and develop student teachers with full competency.
              </li>
              <li className="flex gap-2">
                <span className="text-[#007c91] font-bold">M2.</span> Promote educational research to improve teaching and learning.
              </li>
              <li className="flex gap-2">
                <span className="text-[#007c91] font-bold">M3.</span> Provide social services to contribute to in-service teacher development.
              </li>
            </ul>
          </div>
        </div>

        {/* Core Values */}
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm md:p-12 mb-10">
          <h2 className="mb-8 text-2xl font-bold text-slate-900 text-center">
            Our Core Values <span className="text-[#007c91]">(RIICE)</span>
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Respect",
                desc: "Showing positive feeling and recognizing the moral values of oneself and others through actions and words."
              },
              {
                title: "Integrity",
                desc: "Honesty of individuals manifested through positive thinking, ideas and actions with a sense of responsibility."
              },
              {
                title: "Innovation",
                desc: "Developing oneself regularly through practical experience, research, and creativity in education in response to continuous social and global development."
              },
              {
                title: "Commitment",
                desc: "Strong determination to achieve vision, missions, and goals of the institution."
              },
              {
                title: "Efficiency",
                desc: "Achievement with quality and effectiveness with the minimal use of time, resources, or energy."
              },
            ].map((value, i) => (
              <div key={i} className="rounded-lg bg-slate-50 p-6 border border-slate-100 transition hover:-translate-y-1 hover:border-[#007c91] hover:shadow-md">
                <h3 className="mb-3 text-xl font-bold text-[#007c91]">{value.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Management Team */}
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm md:p-12">
          <h2 className="mb-8 text-2xl font-bold text-slate-900 text-center">
            Our Leadership Team
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <Icon name="account" className="text-5xl text-slate-400" />
              </div>
              <h3 className="font-bold text-slate-900">H.E. Dr. SET SENG</h3>
              <p className="text-[#007c91] font-medium">Director</p>
              <p className="text-xs text-slate-500 mt-2">Since 2018</p>
            </div>

            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <Icon name="account" className="text-5xl text-slate-400" />
              </div>
              <h3 className="font-bold text-slate-900">Mr. ROW PENGSE</h3>
              <p className="text-[#007c91] font-medium">Deputy Director</p>
            </div>

            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <Icon name="account" className="text-5xl text-slate-400" />
              </div>
              <h3 className="font-bold text-slate-900">Mr. DORK CHEA</h3>
              <p className="text-[#007c91] font-medium">Deputy Director</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}