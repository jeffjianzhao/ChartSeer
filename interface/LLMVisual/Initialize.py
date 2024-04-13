import lida.datamodel
import openai
from openai import OpenAI
import json
from llmx import TextGenerator
from lida import Manager, TextGenerationConfig, llm

DESCRIPTION_PROMPT = f"""\n You are an experienced data analyst that can annotate datasets. Your instructions are as follows:
i) ALWAYS generate the name of the dataset and the dataset_description
ii) ALWAYS generate a field description.
iii.) ALWAYS generate a semantic_type (a single word) for each field given its values e.g. company, city, number, supplier, location, gender, longitude, latitude, url, ip address, zip code, email, etc
You must return an updated JSON dictionary without any preamble or explanation.\n"""


class Initialize:
    def __init__(self):
        self.assistant = None
        self.graph_list = []

    def dataset_preview(self, dataset: str):
        self.assistant = LLMAPI(dataset)

    '''
    Todo: 
    def 生成初始概览（数据集）{【上传数据集触发】
        self.llm=llm接口(数据集)
        self.可视化列表+=self.llm.llm3生成初始可视化集合()
        self.投影=self.vae.encoder(self.可视化列表) #调用chartseer的投影函数把初始化的可视化集合投影
        # 使用VAE模型将生成的可视化集合进行投影
    }
    '''


class LLMAPI:
    dataset: str
    dataset_preview: list[str]
    goal_list: list[lida.datamodel.Goal]

    def __init__(self, dataset: str):
        self.dataset = dataset
        self.llm = LLM()
        self.llm.generate_summary(dataset)
        self.charts = []

    def dataset_preview(self) -> str:
        return self.llm.describe()

    def goal(self, n=3) -> list[lida.datamodel.Goal]:
        self.goal_list = self.llm.generate_goals(n)
        return self.llm.goal()

    def generate_charts(self) -> None:
        self.goal_list = self.goal()
        for i in self.goal_list:
            self.charts.append(self.llm.generate_chart(i))


class LLM:
    def __init__(self, prompt=DESCRIPTION_PROMPT):
        self.summary = None
        self.goal_list = None
        self.lida = Manager(text_gen=llm("openai", api_key="your-key"))
        self.textgen_config = TextGenerationConfig(n=1, temperature=0.5, model="gpt-3.5-turbo-0301", use_cache=True)
        self.library = "seaborn"

    def generate_summary(self, file_path: str):
        self.summary = self.lida.summarize(file_path, summary_method="llm", textgen_config=self.textgen_config)

    def describe(self):
        if not self.summary:
            return "Summary have not been generated yet."
        return self.summary['dataset_description']

    def generate_goals(self, n: int):
        self.goal_list = self.lida.goals(self.summary, n=n, textgen_config=self.textgen_config)
        return self.goal_list

    def goal(self):
        if not self.goal_list:
            return "Goals have not been generated yet."
        return self.goal_list

    def generate_chart(self, query: lida.datamodel.Goal):
        chart = self.lida.visualize(summary=self.summary, goal=query,
                                    textgen_config=self.textgen_config, library=self.library)
        return chart

