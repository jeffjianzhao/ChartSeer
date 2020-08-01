##################################################
## CFG grammar for VegaLite visualizations
## This code is based on https://github.com/mkusner/grammarVAE
##################################################
## Author: Jian Zhao
## Contact: jeffjianzhao@gmail.com
##################################################

import nltk
import six
import numpy as np

class VisGrammar():
    def __init__(self, rules):
        # form the CFG and get the start symbol
        self.GCFG = nltk.CFG.fromstring('\n'.join(rules))
        self.start_index = 'root'

        # collect all lhs symbols, and the unique set of them
        all_lhs = [a.lhs().symbol() for a in self.GCFG.productions()]
        self.lhs_list = []
        for a in all_lhs:
            if a not in self.lhs_list:
                self.lhs_list.append(a)

        D = len(self.GCFG.productions())

        # this map tells us the rhs symbol indices for each production rule
        self.rhs_map = [None] * D
        count = 0
        for a in self.GCFG.productions():
            self.rhs_map[count] = []
            for b in a.rhs():
                if not isinstance(b, six.string_types):
                    s = b.symbol()
                    self.rhs_map[count].extend(list(np.where(np.array(self.lhs_list) == s)[0]))
            count = count + 1

        # this tells us for each lhs symbol which productions rules should be masked
        self.masks = np.zeros((len(self.lhs_list), D))
        count = 0
        for sym in self.lhs_list:
            is_in = np.array([a == sym for a in all_lhs], dtype=int).reshape(1,-1)
            self.masks[count] = is_in
            count = count + 1

        # this tells us the indices where the masks are equal to 1
        index_array = []
        for i in range(self.masks.shape[1]):
            index_array.append(np.where(self.masks[:,i]==1)[0][0])
        self.ind_of_ind = np.array(index_array)